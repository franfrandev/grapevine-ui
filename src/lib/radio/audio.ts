const CHANNELS = 2
const FRAME_SIZE = 960
const TARGET_RATE = 48000
const LOOK_AHEAD = 0.5

export function playAudio(ctx: AudioContext, timeObj: { time: number | null }, decodedPackets: Float32Array[]) {
    if (!timeObj.time)
        timeObj.time = ctx.currentTime + LOOK_AHEAD

    console.debug(
        "schedule: time=  current=  delta=  packets=",
        timeObj.time,
        ctx.currentTime,
        timeObj.time - ctx.currentTime,
        decodedPackets.length
    );

    for (const pcmIdx in decodedPackets) {
        const pcm = decodedPackets[pcmIdx]
        const audioBuffer = ctx.createBuffer(CHANNELS, FRAME_SIZE, TARGET_RATE)

        for (let channel = 0; channel < CHANNELS; channel++) {
            const channelData = new Float32Array(FRAME_SIZE);
            let offset = channel;
            for (let frame_i = 0; frame_i < FRAME_SIZE; frame_i++) {
                channelData[frame_i] = pcm[offset]
                offset += CHANNELS
            }
            audioBuffer.copyToChannel(channelData, channel)
        }

        const source = ctx.createBufferSource()
        source.connect(ctx.destination)
        source.buffer = audioBuffer

        timeObj.time = Math.max(timeObj.time, ctx.currentTime + LOOK_AHEAD)
        source.start(timeObj.time)
        timeObj.time += audioBuffer.duration
        // console.debug("Played packet", pcmIdx, "at time", timeObj.time);
        // console.debug("next time, current_time", timeObj.time, ctx.currentTime);
    }
}