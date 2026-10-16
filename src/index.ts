// @ts-check
import {createLibp2p} from 'libp2p'
import {identify} from '@libp2p/identify'
import {noise} from '@chainsafe/libp2p-noise'
import {yamux} from '@chainsafe/libp2p-yamux'
import {multiaddr} from '@multiformats/multiaddr'
import {gossipsub} from '@chainsafe/libp2p-gossipsub'
import {webSockets} from '@libp2p/websockets'
import {webTransport} from '@libp2p/webtransport'
import {webRTC, webRTCDirect} from '@libp2p/webrtc'
import {enable, disable} from '@libp2p/logger'
import {pubsubPeerDiscovery} from '@libp2p/pubsub-peer-discovery'
import {PUBSUB_PEER_DISCOVERY} from './constants'
// import {update, getPeerTypes, getAddresses, getPeerDetails} from './utils'
// @ts-ignore
import {uint8ArrayStartsWith, update, getPeerTypes, getAddresses, getPeerDetails} from './tmp_utils.ts'
import {bootstrap} from '@libp2p/bootstrap'
import {decodePacketMessage} from './message'
import {RtpPacket} from "rtp.js/packets";
import {playAudio} from "./audio";
import {JitterBuffer} from "./jitter_buffer";
import {circuitRelayTransport} from '@libp2p/circuit-relay-v2'
// @ts-ignore
import stations from './stations'
import {kadDHT} from "@libp2p/kad-dht";

const App = async () => {
    enable('libp2p:*')
    // disable()

    const libp2p = await createLibp2p({
        addresses: {
            listen: [// 👇 Required to create circuit relay reservations in order to hole punch browser-to-browser WebRTC connections
                '/p2p-circuit', // 👇 Listen for webRTC connection
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
                    '/ip4/176.97.117.238/tcp/9001/ws/p2p/12D3KooWJjs84sXc4D68Cs3uxsFcdTrittedsMfuVUspHbVDsYbf',
                    '/ip4/176.97.117.238/udp/36688/webrtc-direct/certhash/uEiAIxwfS8k16n36SUL7uuiDc2JyN1UmF0sKJ3x2rb30law/p2p/12D3KooWLuSroVykrWsdf4Lc4gK925bv58mtjfe6CeGFdf4vpv2M'
                ],
            }),
            pubsubPeerDiscovery({
                interval: 1_000,
                topics: [PUBSUB_PEER_DISCOVERY],
            }),
        ],
        services: {
            pubsub: gossipsub(),
            identify: identify(),
        },
    })

    // 👇 Dial peers discovered via pubsub
    libp2p.addEventListener('peer:discovery', async (evt) => {
        // Encapsulate the multiaddrs with the peer ID to ensure correct dialing
        // Should be fixed when https://github.com/libp2p/js-libp2p/issues/3239 is resolved.
        const maddrs = evt.detail.multiaddrs.map((ma) => ma.encapsulate(`/p2p/${evt.detail.id.toString()}`))
        console.log(`Discovered new peer (${evt.detail.id.toString()}). Dialling:`, maddrs.map((ma) => ma.toString()),)
        try {
            await libp2p.dial(maddrs) // dial the new peer
        } catch (err) {
            console.error(`Failed to dial peer (${evt.detail.id.toString()}):`, err)
        }
    })

    libp2p.services.pubsub.addEventListener('message', (evt: any) => {
        if (!audioState) {
            return;
        }

        if (evt.detail.from.toString() !== audioState.sourcePeerId.toString()) {
            console.debug("Received RTP packet from unexpected peer", evt.detail.from.toString());
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
                const worker = audioState.worker;
                if (!worker) return;
                if (payload.byteLength === 0 || uint8ArrayStartsWith(payloadArr, opusHead) || uint8ArrayStartsWith(payloadArr, opusTags)) {
                    const dec = new TextDecoder();
                    console.debug("Received RTP packet with OpusHead or OpusTags", dec.decode(payloadArr));
                    // worker.postMessage(new Uint8Array());
                    return;
                }
                worker.postMessage(payloadArr);
            } else if ("metadata" in maybePacketMessage) {
                console.debug("New metadata:", maybePacketMessage.metadata);
                const currentlyPlaying = maybePacketMessage.metadata;
                audioState.currentlyPlaying = currentlyPlaying;
                // @ts-ignore
                update(DOM.currentlyPlaying(), currentlyPlaying)
            }
        }
    })


    // @ts-ignore
    globalThis.libp2p = libp2p

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
        loggingButtonEnable: () => document.getElementById('button-logging-enable'),
        loggingButtonDisable: () => document.getElementById('button-logging-disable'),
        outputQuery: () => document.getElementById('output'),
        topic: () => document.getElementById('topic'),
        playButton: () => document.getElementById('topic-button'),
        currentlyPlaying: () => document.getElementById('currently-playing'),
        listenOn: () => document.getElementById('listen-on')
    }

    // @ts-ignore
    update(DOM.nodePeerId(), libp2p.peerId.toString())
    // @ts-ignore
    update(DOM.nodeStatus(), 'Online')

    libp2p.addEventListener('peer:connect', (event) => {
    })
    libp2p.addEventListener('peer:disconnect', (event) => {
    })

    let audioState: any = null;

    // @ts-ignore
    DOM.playButton().addEventListener('click', () => {
        // @ts-ignore
        const topic = DOM.topic().value
        console.debug('play topic', topic)
        // @ts-ignore
        libp2p.services.pubsub.subscribe(topic)

        const worker = new Worker('./worker.js', {type: 'module'})

        let currentlyPlaying = ""
        if (audioState) {
            audioState.ctx.close()
            audioState.worker.terminate()
            currentlyPlaying = audioState.currentlyPlaying
        }

        audioState = {
            ctx: new AudioContext(), time: {time: null}, jitterBuffer: new JitterBuffer(), worker: worker, // @ts-ignore
            sourcePeerId: stations[topic].peerId, currentlyPlaying: currentlyPlaying
        }

        worker.addEventListener('message', (e) => {
            // @ts-ignore
            let jitterBuffer = audioState.jitterBuffer
            // console.debug("Received decoded", e.data.length);
            jitterBuffer.push(e.data)
            const maybe_buf = jitterBuffer.pop()
            if (maybe_buf) {
                // @ts-ignore
                playAudio(audioState.ctx, audioState.time, maybe_buf);
            }
        });
    })

    setInterval(() => {
        // @ts-ignore
        update(DOM.nodePeerCount(), libp2p.getConnections().length)
        // @ts-ignore
        update(DOM.nodePeerTypes(), getPeerTypes(libp2p))
        // @ts-ignore
        update(DOM.nodeAddressCount(), libp2p.getMultiaddrs().length)
        // @ts-ignore
        update(DOM.nodeAddresses(), getAddresses(libp2p))
        // @ts-ignore
        update(DOM.nodePeerDetails(), getPeerDetails(libp2p))
    }, 1000)

    // @ts-ignore
    DOM.loggingButtonEnable().onclick = (e) => {
        enable('*,*:debug')
    }
    // @ts-ignore
    DOM.loggingButtonDisable().onclick = (e) => {
        disable()
    }

    // @ts-ignore
    DOM.connectButton().onclick = async (e) => {
        e.preventDefault()
        // @ts-ignore
        let maddr = multiaddr(DOM.inputMultiaddr().value)

        console.log(maddr)
        try {
            await libp2p.dial(maddr)
        } catch (e) {
            console.log(e)
        }
    }
}

App().catch((err) => {
    console.error(err) // eslint-disable-line no-console
})
