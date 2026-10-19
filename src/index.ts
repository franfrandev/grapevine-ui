// @ts-check
import {createLibp2p} from 'libp2p'
import type {Libp2p} from 'libp2p'
import {identify, type Identify} from '@libp2p/identify'
import {noise} from '@chainsafe/libp2p-noise'
import {yamux} from '@chainsafe/libp2p-yamux'
import {multiaddr} from '@multiformats/multiaddr'
import {WebRTC} from '@multiformats/multiaddr-matcher'
import {gossipsub, type GossipSub} from '@libp2p/gossipsub'
import {webSockets} from '@libp2p/websockets'
import {webTransport} from '@libp2p/webtransport'
import {webRTC, webRTCDirect} from '@libp2p/webrtc'
import {enable, disable, logger} from '@libp2p/logger'
import {uint8ArrayStartsWith, update, getPeerTypes, getAddresses, getPeerDetails} from './tmp_utils'
import {bootstrap} from '@libp2p/bootstrap'
import {decodePacketMessage, deserializePeers} from './message'
import {RtpPacket} from "rtp.js/packets";
import {playAudio} from "./audio";
import {JitterBuffer} from "./jitter_buffer";
import {circuitRelayTransport} from '@libp2p/circuit-relay-v2'
import stations from './stations.json'
import {GET_PEERS_PROTOCOL} from "./constants";

interface AudioState {
    ctx: AudioContext,
    time: { time: number | null },
    jitterBuffer: JitterBuffer,
    worker: Worker,
    sourcePeerId: string,
    currentlyPlaying: string
}

const relayMultiAddr = multiaddr("/ip6/fd7a:115c:a1e0::7a3a:5b36/udp/9001/webrtc-direct/certhash/uEiC8LYX0zA3wBB5ipRpZagZWXW_wLOknf3lafvOc9BkwdA/p2p/12D3KooWJjs84sXc4D68Cs3uxsFcdTrittedsMfuVUspHbVDsYbf")

export class WebPeer {
    libp2p: Libp2p<{
        gossipsub: GossipSub
        identify: Identify
    }>
    log = logger('libp2p:webpeer-app')
    audioState: AudioState = {
        ctx: new AudioContext(),
        time: {time: null},
        jitterBuffer: new JitterBuffer(),
        worker: new Worker(new URL('./worker.js', import.meta.url)),
        sourcePeerId: '',
        currentlyPlaying: ''
    }

    constructor(libp2p: Libp2p<{
        gossipsub: GossipSub
        identify: Identify
    }>, DOMCurrentlyPlaying: HTMLElement) {
        this.libp2p = libp2p

        // 👇 Dial peers discovered via pubsub
        this.libp2p.addEventListener('peer:discovery', async (evt) => {
            // Encapsulate the multiaddrs with the peer ID to ensure correct dialing
            // Should be fixed when https://github.com/libp2p/js-libp2p/issues/3239 is resolved.
            const maddrs = evt.detail.multiaddrs.map((ma) => ma.encapsulate(`/p2p/${evt.detail.id.toString()}`))
            this.log(`Discovered new peer (${evt.detail.id.toString()}). Dialling:`, maddrs.map((ma) => ma.toString()),)
            try {
                await libp2p.dial(maddrs) // dial the new peer
            } catch (err) {
                console.error(`Failed to dial peer (${evt.detail.id.toString()}):`, err)
            }
        })

        this.libp2p.services.gossipsub.addEventListener('message', (evt: any) => {
            if (!this.audioState.time) {
                return;
            }

            if (evt.detail.from.toString() !== this.audioState.sourcePeerId.toString()) {
                this.log("Received RTP packet from unexpected peer", evt.detail.from.toString());
                return;
            }

            const maybePacketMessage = decodePacketMessage(evt.detail.data);
            if (maybePacketMessage) {
                if ("data" in maybePacketMessage) {
                    const data = maybePacketMessage.data;
                    // console.debug("Received RTP packet", data);
                    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
                    const rtpPacket = new RtpPacket(dv);
                    const payload = rtpPacket.getPayload();
                    const payloadArr = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
                    const enc = new TextEncoder();
                    const opusHead = enc.encode("OpusHead");
                    const opusTags = enc.encode("OpusTags");
                    const worker = this.audioState.worker;
                    if (!worker) return;
                    if (payload.byteLength === 0 || uint8ArrayStartsWith(payloadArr, opusHead) || uint8ArrayStartsWith(payloadArr, opusTags)) {
                        const dec = new TextDecoder();
                        this.log("Received RTP packet with OpusHead or OpusTags", dec.decode(payloadArr));
                        // worker.postMessage(new Uint8Array());
                        return;
                    }
                    worker.postMessage(payloadArr);
                } else if ("metadata" in maybePacketMessage) {
                    this.log("New metadata:", maybePacketMessage.metadata);
                    const currentlyPlaying = maybePacketMessage.metadata;
                    this.audioState.currentlyPlaying = currentlyPlaying;
                    // @ts-ignore
                    update(DOMCurrentlyPlaying, currentlyPlaying)
                }
            }
        })
    }

    async playRadio() {
        // const topic = DOM.topic().value
        const topic = "rock-it"
        this.log('play topic', topic)
        this.libp2p.services.gossipsub.subscribe(topic)

        const worker = new Worker('./worker.js', {type: 'module'})

        let currentlyPlaying = ""
        if (this.audioState.time.time) {
            await this.audioState.ctx.close()
            this.audioState.worker.terminate()
            currentlyPlaying = this.audioState.currentlyPlaying
        }

        this.audioState = {
            ctx: new AudioContext(), time: {time: null}, jitterBuffer: new JitterBuffer(), worker: worker, // @ts-ignore
            sourcePeerId: stations[topic].peerId, currentlyPlaying: currentlyPlaying
        }

        worker.addEventListener('message', (e) => {
            // @ts-ignore
            let jitterBuffer = this.audioState.jitterBuffer
            // console.debug("Received decoded", e.data.length);
            jitterBuffer.push(e.data)
            const maybe_buf = jitterBuffer.pop()
            if (maybe_buf) {
                // @ts-ignore
                playAudio(this.audioState.ctx, this.audioState.time, maybe_buf);
            }
        });
    }

    async checkPeersCount() {
        let peerCount = this.libp2p.getPeers().length
        if (peerCount <= 2) {
            this.log("Peer count is low, requesting more peers...")
            await this.requestPeers()
        }
    }

    async requestPeers() {
        this.log("Requesting peers from bootnode")

        const myMultiAddr = this.libp2p.getMultiaddrs().find(address => WebRTC.exactMatch(address))
        // if (myMultiAddr == null) {
        //     this.log('Waiting for a relay reservation and a WebRTC listen address')
        //     return
        // }

        const stream = await this.libp2p.dialProtocol(multiaddr(relayMultiAddr), GET_PEERS_PROTOCOL,
            {
                signal: AbortSignal.timeout(5_000)
            }
        )

        stream.addEventListener('message', async (evt) => {
            const peers = deserializePeers(evt.data)
            this.log('Received peers', peers)
            for (const peer of peers) {
                if (!WebRTC.exactMatch(peer)) continue
                await this.libp2p.dial(peer)
            }
        }, {once: true})

        if (myMultiAddr == null) {
            stream.send(new Uint8Array())
        } else {
            stream.send(myMultiAddr.bytes)
        }
        await stream.close({signal: AbortSignal.timeout(5_000)})
    }
}

const App = async () => {
    enable('libp2p:webpeer-app*')
    // disable()

    const libp2p = await createLibp2p({
        addresses: {
            listen: [
                '/p2p-circuit',
                '/webrtc',
            ],
        },
        transports: [webSockets(), webTransport(), webRTC(), circuitRelayTransport(), webRTCDirect()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        connectionGater: {
            // Allow private addresses for local testing
            denyDialMultiaddr: async () => false,
        },
        peerDiscovery: [
            bootstrap({
                list: [
                    // '/ip6/fe80::32c5:99ff:feac:58d2/udp/36688/webrtc-direct/certhash/uEiDd9M1SGBCtA-QHolqGVKoGTN5Jh8pd8_7IPtEPNJ7Eug'
                    relayMultiAddr.toString()
                ],
            }),
        ],
        services: {
            // ping: ping(),
            gossipsub: gossipsub(),
            // Browser listen addresses come from relay reservations. AutoNAT is
            // unnecessary here and triggers an SCTP shutdown in Firefox.
            identify: identify()
        },
    })

    const DOM = {
        nodePeerId: () => document.getElementById('output-node-peer-id'),
        nodeStatus: () => document.getElementById('output-node-status'),
        nodePeerCount: () => document.getElementById('output-peer-count'),
        nodePeerTypes: () => document.getElementById('output-peer-types'),
        nodePeerDetails: () => document.getElementById('output-peer-details'),
        nodeAddressCount: () => document.getElementById('output-address-count'),
        nodeAddresses: () => document.getElementById('output-addresses'),

        inputMultiaddr: () => document.getElementById('input-multiaddr'),
        connectButton: () => document.getElementById('button-connect'),
        currentlyPlaying: () => document.getElementById('currently-playing'),
    }

    const webapp = new WebPeer(libp2p, DOM.currentlyPlaying())
    await webapp.playRadio()

    update(DOM.nodePeerId(), libp2p.peerId.toString())
    update(DOM.nodeStatus(), 'Online')

    setInterval(() => {
        update(DOM.nodePeerCount(), libp2p.getConnections().length.toString())
        update(DOM.nodePeerTypes(), getPeerTypes(libp2p))
        update(DOM.nodeAddressCount(), libp2p.getMultiaddrs().length.toString())
        update(DOM.nodeAddresses(), getAddresses(libp2p))
        update(DOM.nodePeerDetails(), getPeerDetails(libp2p))
    }, 1000)

    setInterval(() => {
        webapp.checkPeersCount()
    }, 2000)

    // @ts-ignore
    DOM.connectButton().onclick = async (e) => {
        e.preventDefault()
        // @ts-ignore
        let maddr = multiaddr(DOM.inputMultiaddr().value)

        console.debug(maddr)
        try {
            await libp2p.dial(maddr)
        } catch (e) {
            console.error(e)
        }
    }
}

App().catch((err) => {
    console.error(err) // eslint-disable-line no-console
})
