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
import {uint8ArrayStartsWith, update} from './tmp_utils'
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

const relayMultiAddr = multiaddr("/ip4/176.97.117.238/udp/9001/webrtc-direct/certhash/uEiBe_iQyp9K6lCiUFcWk1tsNOwsRgJFfH7yTarASh9zx_w/p2p/12D3KooWRsM61hZDp41qhFcTLmWAwjx32ayYcvJ5kcRsj6LxadeL")

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
    currentConnectionState: string = ""
    DOMCurrentlyPlaying: HTMLElement

    constructor(libp2p: Libp2p<{
        gossipsub: GossipSub
        identify: Identify
    }>, DOMCurrentlyPlaying: HTMLElement) {
        this.libp2p = libp2p
        this.DOMCurrentlyPlaying = DOMCurrentlyPlaying

        this.libp2p.addEventListener('peer:discovery', async (evt) => this.discoverPeer(evt))

        this.libp2p.services.gossipsub.addEventListener('message', (evt: any) => this.receiveGossipSubMessage(evt))

        setInterval(() => this.checkConnectionState(), 1000)
    }

    checkConnectionState() {
        const conns = this.libp2p.getConnections();

        if (this.currentConnectionState == "OK") return

        if (conns.find((conn) => WebRTC.exactMatch(conn.remoteAddr))) {
            this.currentConnectionState = "Waiting for RTP packets"
        } else {
            this.currentConnectionState = "Not connected to WebRTC peers"
        }
    }

    async playRadio() {
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

        document.addEventListener('touchstart', this.fixAudioContext)
        document.addEventListener('touchend', this.fixAudioContext)

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

    async fixAudioContext() {
        // Create empty buffer
        const buffer = this.audioState.ctx.createBuffer(1, 1, 22050);
        const source = this.audioState.ctx.createBufferSource();
        source.buffer = buffer;
        // Connect to output (speakers)
        source.connect(this.audioState.ctx.destination);
        // Play sound
        source.start(0);
        await this.audioState.ctx.resume()
        // Remove events
        document.removeEventListener('touchstart', this.fixAudioContext);
        document.removeEventListener('touchend', this.fixAudioContext);
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
        if (myMultiAddr == null) {
            this.log('Waiting for a relay reservation and a WebRTC listen address')
            return
        }

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
                try {
                    await this.libp2p.dial(peer)
                } catch (err) {
                    console.debug(`Failed to dial peer (${peer.toString()}):`, err)
                }
            }
        }, {once: true})

        if (myMultiAddr == null) {
            stream.send(new Uint8Array())
        } else {
            stream.send(myMultiAddr.bytes)
        }
        await stream.close({signal: AbortSignal.timeout(5_000)})
    }

    async discoverPeer(evt: any) {
        // Encapsulate the multiaddrs with the peer ID to ensure correct dialing
        // Should be fixed when https://github.com/libp2p/js-libp2p/issues/3239 is resolved.
        const maddrs = evt.detail.multiaddrs.map((ma) => ma.encapsulate(`/p2p/${evt.detail.id.toString()}`))
        this.log(`Discovered new peer (${evt.detail.id.toString()}). Dialling:`, maddrs.map((ma) => ma.toString()),)
        try {
            await this.libp2p.dial(maddrs) // dial the new peer
        } catch (err) {
            console.debug(`Failed to dial peer (${evt.detail.id.toString()}):`, err)
        }
    }

    receiveGossipSubMessage(evt: any) {
        if (!this.audioState.time) {
            return;
        }

        this.currentConnectionState = "Receiving unauthenticated RTP packet"

        if (evt.detail.from.toString() !== this.audioState.sourcePeerId.toString()) {
            this.log("Received RTP packet from unexpected peer", evt.detail.from.toString());
            return;
        }

        this.currentConnectionState = "OK"

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
        connectionStatus: () => document.getElementById('connection-status'),
        nodePeerId: () => document.getElementById('output-node-peer-id'),

        inputMultiaddr: () => document.getElementById('input-multiaddr'),
        connectButton: () => document.getElementById('button-connect'),
        currentlyPlaying: () => document.getElementById('currently-playing'),
    }

    const webapp = new WebPeer(libp2p, DOM.currentlyPlaying())
    await webapp.playRadio()

    globalThis.libp2p = libp2p

    update(DOM.nodePeerId(), libp2p.peerId.toString())

    setInterval(() => {
        update(DOM.connectionStatus(), webapp.currentConnectionState)
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
            const conn = await libp2p.dial(maddr)
            console.debug(`Dialing ${maddr.toString()} successful`)
        } catch (e) {
            console.error(e)
        }
    }
}

App().catch((err) => {
    console.error(err) // eslint-disable-line no-console
})
