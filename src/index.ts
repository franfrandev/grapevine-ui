// @ts-check
import type {Libp2p} from 'libp2p'
import {createLibp2p} from 'libp2p'
import {identify, type Identify} from '@libp2p/identify'
import {noise} from '@chainsafe/libp2p-noise'
import {yamux} from '@chainsafe/libp2p-yamux'
import {multiaddr} from '@multiformats/multiaddr'
import {WebRTC} from '@multiformats/multiaddr-matcher'
import {gossipsub, type GossipSub, type Message, type SignedMessage} from '@libp2p/gossipsub'
import {webSockets} from '@libp2p/websockets'
import {webTransport} from '@libp2p/webtransport'
import {webRTC, webRTCDirect} from '@libp2p/webrtc'
import {enable, logger} from '@libp2p/logger'
import {uint8ArrayStartsWith, update} from './tmp_utils'
import {bootstrap} from '@libp2p/bootstrap'
import {decodePacketMessage, deserializePeers, type MetadataMessage} from './message'
import {RtpPacket} from "rtp.js/packets";
import {playAudio} from "./audio";
import {JitterBuffer} from "./jitter_buffer";
import {circuitRelayTransport} from '@libp2p/circuit-relay-v2'
import stations from './stations.json'
import {GET_PEERS_PROTOCOL, HELLO_PROTOCOL} from "./constants";
import {ConnectionStatus} from "./connection_status";
import type {Connection, Stream, StreamMessageEvent} from "@libp2p/interface"

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
    private log = logger('libp2p:webpeer-app')
    private audioState: AudioState = {
        ctx: new AudioContext(),
        time: {time: null},
        jitterBuffer: new JitterBuffer(),
        worker: new Worker(new URL('./worker.js', import.meta.url)),
        sourcePeerId: '',
        currentlyPlaying: ''
    }
    currentConnectionState: ConnectionStatus = new ConnectionStatus()
    private readonly DOMCurrentlyPlaying: HTMLElement
    private latestMetadataPacket: Uint8Array;

    constructor(libp2p: Libp2p<{
        gossipsub: GossipSub
        identify: Identify
    }>, DOMCurrentlyPlaying: HTMLElement) {
        this.libp2p = libp2p
        this.DOMCurrentlyPlaying = DOMCurrentlyPlaying

        this.libp2p.addEventListener('peer:discovery', async (evt) => this.discoverPeer(evt))

        this.libp2p.addEventListener('connection:open', async (evt) => this.handleConnectPeer(evt))

        this.libp2p.services.gossipsub.addEventListener('message', (evt) => this.receiveGossipSubMessage(evt))

        this.libp2p.handle(HELLO_PROTOCOL, this.handleHelloProtocol.bind(this))

        setInterval(() => this.checkConnectionState(), 1000)
    }

    async handleHelloProtocol(stream: Stream, connection: Connection) {
        stream.addEventListener('message', (evt: StreamMessageEvent) => {
            this.log("handleConnectPeer: received data")
            // TODO check source is streamer
            const packet = evt.data.slice()
            const maybePacketMessage = decodePacketMessage(packet);
            if (maybePacketMessage == null) {
                this.log("handleConnectPeer: received invalid packet")
                return
            }
            if (!("metadata" in maybePacketMessage)) {
                this.log("handleConnectPeer: received invalid packet")
                return
            }
            this.updateMetadata(maybePacketMessage, packet)
        }, {once: true, signal: AbortSignal.timeout(5000)})
    }

    async handleConnectPeer(evt: CustomEvent<Connection>) {
        const conn = evt.detail
        if (conn == null) {
            this.log("handleConnectPeer: no connection found")
            return
        }
        if (WebRTC.exactMatch(conn.remoteAddr)) {
            // this.currentConnectionState.setWaitingForRTPPackets()
            // TODO: if inbound, potentially open a stream to send our latest metadata.
            this.log("handleConnectPeer: WebRTC connection")
            const stream = await this.libp2p.dialProtocol(conn.remotePeer, HELLO_PROTOCOL,
                {
                    signal: AbortSignal.timeout(5000)
                })

            // in case you missed it...
            stream.send(this.latestMetadataPacket)
        }
    }

    checkConnectionState() {
        const conns = this.libp2p.getConnections();

        // OK
        if (this.currentConnectionState.code == 3) return

        if (this.libp2p.getMultiaddrs().length == 0) {
            this.currentConnectionState.setNoMultiaddrs()
        }

        if (conns.find((conn) => WebRTC.exactMatch(conn.remoteAddr))) {
            this.currentConnectionState.setWaitingForRTPPackets()
        } else {
            this.currentConnectionState.setWaitingForWebRTCPeers()
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
            ctx: new AudioContext(), time: {time: null}, jitterBuffer: new JitterBuffer(), worker: worker,
            sourcePeerId: stations[topic].peerId, currentlyPlaying: currentlyPlaying
        }

        document.addEventListener('touchstart', this.fixAudioContext)
        document.addEventListener('touchend', this.fixAudioContext)

        worker.addEventListener('message', (e) => {
            let jitterBuffer = this.audioState.jitterBuffer
            // console.debug("Received decoded", e.data.length);
            jitterBuffer.push(e.data)
            const maybe_buf = jitterBuffer.pop()
            if (maybe_buf) {
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

        const stream = await this.libp2p.dialProtocol(relayMultiAddr, GET_PEERS_PROTOCOL,
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

        stream.send(myMultiAddr.bytes)
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

    receiveGossipSubMessage(evt: CustomEvent<Message>) {
        if (!this.audioState.time) {
            return;
        }

        const evtDetail = evt.detail as SignedMessage
        if (evtDetail.from.toString() !== this.audioState.sourcePeerId.toString()) {
            this.log("Received RTP packet from unexpected peer", evtDetail.from.toString());
            return;
        }

        this.currentConnectionState.setOK();

        const rawPacket = evtDetail.data;
        const maybePacketMessage = decodePacketMessage(rawPacket);
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
                if (uint8ArrayStartsWith(payloadArr, opusHead) || uint8ArrayStartsWith(payloadArr, opusTags)) {
                    const dec = new TextDecoder();
                    this.log("Received RTP packet with OpusHead or OpusTags", dec.decode(payloadArr));
                }
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
                this.updateMetadata(maybePacketMessage, rawPacket)
            }
        }
    }

    updateMetadata(metadataPacket: MetadataMessage, rawPacket: Uint8Array) {
        this.log("New metadata:", metadataPacket.metadata);
        const currentlyPlaying = metadataPacket.metadata;
        this.audioState.currentlyPlaying = currentlyPlaying;
        this.latestMetadataPacket = rawPacket;
        update(this.DOMCurrentlyPlaying, currentlyPlaying)
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
        update(DOM.connectionStatus(), webapp.currentConnectionState.message)
    }, 1000)

    setInterval(() => {
        webapp.checkPeersCount()
    }, 2000)

    DOM.connectButton().onclick = async (e) => {
        e.preventDefault()
        const inputEl = DOM.inputMultiaddr()
        const inputMultiaddr = inputEl as HTMLInputElement
        let maddr = multiaddr(inputMultiaddr.value)

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
