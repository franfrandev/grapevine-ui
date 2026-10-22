import init, { AudioDecoder } from './web.js';
import wasmUrl from './web_bg.wasm?url';

const decoderPromise = init({ module_or_path: wasmUrl }).then(() => AudioDecoder.new());

self.addEventListener('message', (event: MessageEvent<Uint8Array>) => {
	void decoderPromise
		.then((decoder) => decoder.decode_message_ext(event.data))
		.then((decoded) => self.postMessage(decoded))
		.catch((error: unknown) => {
			console.error('Audio decode failed', error);
		});
});

void decoderPromise.catch((error: unknown) => {
	console.error('Could not initialize the audio decoder', error);
});
