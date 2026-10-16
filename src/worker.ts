import init, {AudioDecoder} from "./web.js";

(async () => {
    await init('./web_bg.wasm');

    const audioDecoder = AudioDecoder.new();

    onmessage = async event => {
        // console.debug('Received message', event.data);
        const decoded = audioDecoder.decode_message_ext(event.data);

        self.postMessage(decoded);
    }

    console.debug('Web worker initialized');
})()