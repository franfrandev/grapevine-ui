import {createLibp2p} from 'libp2p'
import {autoNAT} from '@libp2p/autonat'
import {identify} from '@libp2p/identify'
import {noise} from '@chainsafe/libp2p-noise'
import {yamux} from '@chainsafe/libp2p-yamux'
import {gossipsub} from '@chainsafe/libp2p-gossipsub'
import {webSockets} from '@libp2p/websockets'
import {tcp} from '@libp2p/tcp'
import {circuitRelayServer} from '@libp2p/circuit-relay-v2'
import {logger, defaultLogger, enable, disable} from "@libp2p/logger";
import {generateKeyPair} from '@libp2p/crypto/keys'
import {keychain as keychainInit} from '@libp2p/keychain'
import {LevelDatastore} from 'datastore-level'
import {PUBSUB_PEER_DISCOVERY} from "./constants.js";

async function main() {
    // disable()

    enable('libp2p:relay-app:*,*')

    const log = logger('libp2p:relay-app')

    log("starting relay")

    // Default using level as backend for node or the browser
    const datastore = new LevelDatastore('keystore')

    const keychain = keychainInit({
        pass: '12345678901234567890'
    })({
        datastore, logger: defaultLogger()
    })

    let key;
    try {
        // const keyInfo = await keychain.findKeyByName("default")
        key = await keychain.exportKey("default")
        log("using the default key")
    } catch (e) {
        log("generating a new key because the default key does not exist")
        key = await generateKeyPair('Ed25519')
        await keychain.importKey("default", key)
    }

    const libp2p = await createLibp2p({
        addresses: {
            listen: ['/ip4/0.0.0.0/tcp/9001/ws', '/ip4/0.0.0.0/tcp/9002',],
        }, transports: [webSockets(), tcp(),], connectionEncrypters: [noise()], streamMuxers: [yamux()], services: {
            identify: identify(), autoNat: autoNAT(), relay: circuitRelayServer(), pubsub: gossipsub(),
        }, privateKey: key
    })

    libp2p.services.pubsub.subscribe(PUBSUB_PEER_DISCOVERY)

    libp2p.addEventListener('peer:connect', async (evt) => {
        const pid = evt.detail
        log("peer connected", pid)
        // only allowing 10s to avoid monopolizing bandwidth
        setTimeout(() => {
            libp2p.hangUp(pid)
        }, 10000)
    })

    console.log('PeerID: ', libp2p.peerId.toString())
    console.log('Multiaddrs: ', libp2p.getMultiaddrs())

    log("started")
}

main()
