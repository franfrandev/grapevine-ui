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