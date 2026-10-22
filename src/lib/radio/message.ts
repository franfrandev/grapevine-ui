import {varint} from 'multiformats'
import {Uint8ArrayList} from 'uint8arraylist'
import {multiaddr, type Multiaddr} from "@multiformats/multiaddr";

export interface PacketMessage {
    data: Uint8Array;
}

export interface MetadataMessage {
    metadata: string;
}

export function decodePacketMessage(packet: Uint8Array): PacketMessage | MetadataMessage | null {
    if (packet.length <= 0) {
        return null;
    }

    const id = packet[0];
    if (id == 0) {
        const data = packet.subarray(1);
        return {data};
    } else if (id == 1) {
        const decoder = new TextDecoder("utf-8");
        const metadata = decoder.decode(packet.subarray(1));
        return {metadata};
    } else {
        return null;
    }
}

export function serializePeers(peers: Multiaddr[]): Uint8Array {
    const peersSerializedList: Uint8Array[] = []
    for (const peer of peers) {
        const len = peer.bytes.length
        const varintLen = varint.encodingLength(len)
        const serialized = new Uint8Array(varintLen + len)
        varint.encodeTo(len, serialized, 0)
        serialized.set(peer.bytes, varintLen)
        peersSerializedList.push(serialized)
    }
    return Uint8ArrayList.fromUint8Arrays(peersSerializedList).subarray()
}

export function deserializePeers(data: Uint8Array | Uint8ArrayList | {
    subarray: (start?: number, end?: number) => Uint8Array
}): Multiaddr[] {
    const bytes = data instanceof Uint8Array ? data : data.subarray()
    const peers: Multiaddr[] = []
    let buf = bytes
    while (buf.byteLength > 0) {
        const [len, offset] = varint.decode(buf)
        const totalLen = offset + len
        const maBytes = buf.subarray(offset, totalLen)
        const ma = multiaddr(maBytes)
        peers.push(ma)
        buf = buf.subarray(totalLen)
    }
    return peers
}