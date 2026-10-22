export class JitterBuffer {
    buffer: Float32Array[] = []

    push(data: Float32Array) {
        this.buffer.push(data)
    }

    pop(): Float32Array[] {
        if (this.buffer.length > 200) {
            const ret = [];
            for (let i = 0; i < 100; i++) {
                ret.push(this.buffer.shift())
            }
            return ret
        } else {
            return null
        }
    }
}