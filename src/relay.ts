import {createLibp2p} from 'libp2p'
import type {Libp2p} from 'libp2p'
import {autoNAT} from '@libp2p/autonat'
import {identify} from '@libp2p/identify'
import {noise} from '@chainsafe/libp2p-noise'
import {yamux} from '@chainsafe/libp2p-yamux'
import {webSockets} from '@libp2p/websockets'
import {tcp} from '@libp2p/tcp'
import {webRTCDirect} from '@libp2p/webrtc'
import {circuitRelayServer} from '@libp2p/circuit-relay-v2'
import {logger, defaultLogger, enable, disable} from "@libp2p/logger";
import {generateKeyPair} from '@libp2p/crypto/keys'
import {keychain as keychainInit} from '@libp2p/keychain'
import {LevelDatastore} from 'datastore-level'
import {GET_PEERS_PROTOCOL} from "./constants";
import type {Connection, PeerId, PrivateKey, Stream} from "@libp2p/interface";
import {serializePeers} from "./message";
import {fileURLToPath} from 'url';
import {multiaddr, type Multiaddr} from '@multiformats/multiaddr';
import {LRU} from "./lru";
import {keychain} from '@libp2p/keychain'

interface PeerInfoAddr {
    peerId: PeerId;
    addr: string;
    port: number;
    cert: string;
}

export class Relay {
    libp2p: Libp2p;
    log = logger('libp2p:relay-app');
    announcedPeers: LRU<PeerId, Multiaddr> = new LRU(100);

    constructor(libp2p: Libp2p) {
        this.libp2p = libp2p;
        this.libp2p.handle(GET_PEERS_PROTOCOL, this.handleProposePeers.bind(this))

        this.libp2p.addEventListener('peer:connect', async (evt) => {
            const pid = evt.detail;
            this.log("peer connected", pid);
            // Keep the connection open for this peer's relay reservation and
            // incoming WebRTC signaling from other browsers.
        });
    }

    async choosePeers(requestingPeer?: PeerId, count = 5): Promise<Multiaddr[]> {
        const mhs: Multiaddr[] = [];
        const entries = Array.from(this.announcedPeers.cache.entries());

        for (let i = entries.length - 1; i >= 0; i--) {
            const [peerId, mh] = entries[i];

            if (requestingPeer) {
                if (peerId) {
                    if (typeof (peerId as any).equals === 'function' && (peerId as any).equals(requestingPeer)) {
                        continue;
                    }
                    if (peerId.toString() === requestingPeer.toString()) {
                        continue;
                    }
                }
                const p2pComp = mh.getComponents().find(c => c.name === 'p2p');
                if (p2pComp && p2pComp.value === requestingPeer.toString()) {
                    continue;
                }
            }

            mhs.push(mh);
            if (mhs.length >= count) {
                break;
            }
        }

        return mhs;
    }

    async handleProposePeers(stream: Stream, connection: Connection) {
        console.log("handleProposePeers", stream, connection);
        this.log("peer requesting peers", connection.remotePeer.toString());
        stream.addEventListener('message', async (evt) => {
            const mh = multiaddr(evt.data.slice())
            this.announcedPeers.set(connection.remotePeer, mh)
        }, {once: true})
        this.log("peer requesting peers", connection.remotePeer.toString());
        const peers = await this.choosePeers(connection.remotePeer, 3);
        this.log('Sending peers', peers);
        const peersSerialized = serializePeers(peers);
        this.log('Sending peers serialized', peersSerialized);
        stream.send(peersSerialized);
        await stream.close({signal: AbortSignal.timeout(5_000)});
    }
}

async function main() {
    enable('libp2p:relay-app*')
    // disable()

    const log = logger('libp2p:relay-app')

    log("starting relay")

    // Default using level as backend for node or the browser
    const datastore = new LevelDatastore('keystore')
    await datastore.open()

    const keychainVar = keychainInit({
        pass: '12345678901234567890'
    })({
        datastore, logger: defaultLogger()
    })

    let key: PrivateKey;
    try {
        // const keyInfo = await keychain.findKeyByName("default")
        key = await keychainVar.exportKey("default")
        log("using the default key")
    } catch (e) {
        log("generating a new key because the default key does not exist")
        key = await generateKeyPair('Ed25519')
        await keychainVar.importKey("default", key)
    }

    const nodeDatastore = new LevelDatastore('node')

    const libp2p = await createLibp2p({
        addresses: {
            // listen: ['/ip4/0.0.0.0/tcp/9001/ws', '/ip4/0.0.0.0/tcp/9002',],
            listen: ['/ip6/::/udp/9001/webrtc-direct',],
        },
        datastore: nodeDatastore,
        transports: [webSockets(), tcp(), webRTCDirect()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
            identify: identify(), autoNat: autoNAT(), relay: circuitRelayServer(), keychain: keychain()
        },
        privateKey: key
    })

    const relay = new Relay(libp2p);

    console.debug('PeerID: ', libp2p.peerId.toString())
    console.debug('Multiaddrs: ', libp2p.getMultiaddrs())

    log("started")
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main()
}
