export class ConnectionStatus {
    code: number
    message: string

    constructor() {
        this.setInitialized()
    }

    setStatus(code: number, message: string) {
        this.code = code
        this.message = message
    }

    setInitialized() {
        this.setStatus(0, "Initialized")
    }

    setWaitingForWebRTCPeers() {
        this.setStatus(1, "Not connected to WebRTC peers")
    }

    setWaitingForRTPPackets() {
        this.setStatus(2, "Waiting for RTP packets")
    }

    setOK() {
        this.setStatus(3, "OK")
    }

    setNoMultiaddrs() {
        this.setStatus(4, "No multiaddrs")
    }
}