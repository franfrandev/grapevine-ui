<script lang="ts">
	import { onMount } from 'svelte';
	import { startRadio } from '#lib/radio/index';

	let connectionStatusElement: HTMLSpanElement;
	let peerIdElement: HTMLElement;
	let peerAddressInput: HTMLInputElement;
	let connectButton: HTMLButtonElement;
	let currentlyPlayingElement: HTMLElement;

	onMount(() => {
		void startRadio({
			connectionStatus: connectionStatusElement,
			nodePeerId: peerIdElement,
			inputMultiaddr: peerAddressInput,
			connectButton,
			currentlyPlaying: currentlyPlayingElement
		}).catch((error: unknown) => {
			console.error('Could not start Grapevine Radio', error);
			connectionStatusElement.textContent = 'RADIO UNAVAILABLE';
		});
	});
</script>

<svelte:head>
	<title>Grapevine Radio</title>
	<meta
		name="description"
		content="A simple, always-on radio. Tune in to Grapevine Radio."
	/>
	<meta name="theme-color" content="#f4f1e8" />
</svelte:head>

<main class="page-shell">
	<header class="topbar" aria-label="Grapevine Radio">
		<a class="wordmark" href="/" aria-label="Grapevine Radio home">
			<span class="mark" aria-hidden="true"><span></span><span></span><span></span></span>
			<span>grapevine<span class="wordmark-light">radio</span></span>
		</a>
		<div class="topbar-note"><span class="tiny-dot" aria-hidden="true"></span> ONE STATION. ALWAYS ON.</div>
	</header>

	<section class="radio" aria-labelledby="station-name">
		<div class="artwork" aria-label="Abstract grape-inspired station artwork" role="img">
			<div class="art-orbit orbit-one"></div>
			<div class="art-orbit orbit-two"></div>
			<div class="art-sun"></div>
			<div class="art-leaf leaf-one"></div>
			<div class="art-leaf leaf-two"></div>
			<div class="art-label"><span>GV</span><span>VOL. 001</span></div>
			<div class="art-caption">SOUND<br />IN GOOD<br />COMPANY.</div>
		</div>

		<div class="station-panel">
			<div class="eyebrow-row">
				<span class="eyebrow">YOUR RADIO</span>
				<span class="status"><span class="status-dot" aria-hidden="true"></span> <span id="connection-status" bind:this={connectionStatusElement} role="status" aria-live="polite">STARTING UP</span></span>
			</div>

			<div class="station-copy">
				<p class="station-kicker">THE GRAPEVINE</p>
				<h1 id="station-name">A little<br />sound, <em>everywhere.</em></h1>
				<p class="station-description">One shared frequency, coming to you over the peer-to-peer airwaves.</p>
			</div>

			<div class="now-playing">
				<div class="track-info">
					<span class="section-label">ON THE AIR</span>
					<strong>Grapevine Radio</strong>
					<span class="track-subtitle" id="currently-playing" bind:this={currentlyPlayingElement}>Waiting for station metadata</span>
				</div>
				<div class="waveform" aria-label="Waiting for audio" role="img">
					{#each Array(25) as _, index}
						<span style={`--i: ${index}; --bar-height: ${(index * 13 + 17) % 23 + 5}px`}></span>
					{/each}
				</div>
			</div>

			<div class="divider"></div>

			<p class="autoplay-note"><span aria-hidden="true">↗</span> Playback begins automatically when you arrive.</p>

			<details class="connection-details">
				<summary>Connection details</summary>
				<div class="connection-content">
					<p class="peer-id-row"><span>YOUR PEER ID</span><code id="output-node-peer-id" bind:this={peerIdElement}>Starting radio node…</code></p>
					<form class="peer-form">
						<label for="input-multiaddr">Connect to a peer</label>
						<div class="peer-form-controls">
							<input id="input-multiaddr" bind:this={peerAddressInput} type="text" placeholder="/ip4/…/p2p/…" autocomplete="off" />
							<button id="button-connect" bind:this={connectButton} type="button">Connect</button>
						</div>
					</form>
				</div>
			</details>
		</div>
	</section>

	<footer class="footer">
		<span>GOOD THINGS TRAVEL.</span>
		<span class="footer-center">A RADIO FOR THE REST OF US</span>
		<span>EST. 2026&nbsp; <span class="footer-flower" aria-hidden="true">✳</span></span>
	</footer>
</main>

<style>
	:global(*) { box-sizing: border-box; }
	:global(html) { min-width: 320px; background: #f4f1e8; }
	:global(body) {
		margin: 0;
		color: #252522;
		font-family: Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
		-webkit-font-smoothing: antialiased;
	}
	:global(button), :global(input) { font: inherit; }

	.page-shell {
		--ink: #252522;
		--muted: #85847b;
		--orange: #ee6845;
		min-height: 100svh;
		max-width: 1600px;
		margin: 0 auto;
		padding: 0 clamp(24px, 7.2vw, 112px);
		display: flex;
		flex-direction: column;
	}
	.topbar, .footer { display: flex; justify-content: space-between; align-items: center; }
	.topbar { height: 92px; border-bottom: 1px solid #dedbd1; }
	.wordmark { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-size: 17px; font-weight: 750; letter-spacing: -0.8px; }
	.wordmark-light { color: #8e8b80; font-weight: 450; }
	.mark { height: 22px; width: 22px; display: flex; gap: 2px; align-items: center; justify-content: center; border-radius: 50%; background: var(--orange); transform: rotate(-24deg); }
	.mark span { width: 3px; background: #fff0d8; border-radius: 4px; }
	.mark span:nth-child(1) { height: 7px; }
	.mark span:nth-child(2) { height: 12px; }
	.mark span:nth-child(3) { height: 8px; }
	.topbar-note, .eyebrow, .status, .station-kicker, .section-label, .footer { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
	.topbar-note { color: #79776f; display: flex; align-items: center; gap: 9px; font-size: 9px; letter-spacing: 1.15px; }
	.tiny-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--orange); }

	.radio { width: min(100%, 1050px); margin: auto; padding: clamp(48px, 8vh, 88px) 0; align-self: center; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: clamp(48px, 8vw, 112px); }
	.artwork { aspect-ratio: 1 / 1; position: relative; overflow: hidden; isolation: isolate; background: #df6849; box-shadow: 0 22px 55px #3f2e201a; }
	.artwork::before { content: ""; position: absolute; z-index: -1; width: 120%; aspect-ratio: 1; left: -36%; bottom: -64%; border-radius: 50%; background: #f3af68; }
	.artwork::after { content: ""; position: absolute; z-index: -1; width: 74%; aspect-ratio: 1; right: -22%; top: -30%; border-radius: 50%; border: 1px solid #f8d5a554; }
	.art-orbit { position: absolute; z-index: -1; border: 1px solid #f8d5a554; border-radius: 50%; }
	.orbit-one { width: 86%; aspect-ratio: 1; top: 8%; left: 7%; }
	.orbit-two { width: 66%; aspect-ratio: 1; top: 18%; left: 17%; }
	.art-sun { width: 40%; aspect-ratio: 1; position: absolute; top: 31%; left: 30%; border-radius: 50%; background: #f6cc86; box-shadow: 0 0 0 17px #f6cc861c, 0 0 0 42px #f6cc8612; }
	.art-leaf { position: absolute; width: 26%; height: 12%; border-radius: 100% 0 100% 0; background: #554f4a; }
	.leaf-one { transform: rotate(38deg); left: 21%; top: 48%; }
	.leaf-two { transform: scaleX(-1) rotate(38deg); right: 20%; top: 53%; background: #78614e; }
	.art-label { position: absolute; top: 8%; left: 8%; right: 8%; display: flex; justify-content: space-between; color: #fff3dd; font: 10px "SFMono-Regular", Consolas, monospace; letter-spacing: 1.5px; }
	.art-label span:first-child { font-size: 13px; font-weight: 700; }
	.art-caption { position: absolute; bottom: 8%; left: 8%; color: #fff3dd; font-size: clamp(18px, 2.7vw, 34px); font-weight: 800; line-height: .94; letter-spacing: -1.5px; }

	.station-panel { min-width: 0; }
	.eyebrow-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding-bottom: 18px; border-bottom: 1px solid #dedbd1; }
	.eyebrow, .status { color: var(--muted); font-size: 9px; letter-spacing: 1.4px; }
	.status { display: flex; align-items: center; gap: 7px; color: #b17b54; }
	.status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #d6a06d; animation: breathe 1.8s ease-in-out infinite; }
	.station-copy { padding: 35px 0 31px; }
	.station-kicker { color: var(--orange); margin: 0 0 16px; font-size: 10px; letter-spacing: 2px; }
	h1 { margin: 0; font-size: clamp(42px, 5.5vw, 72px); line-height: .98; letter-spacing: -4px; font-weight: 620; }
	h1 em { color: var(--orange); font-family: Georgia, "Times New Roman", serif; font-weight: 400; letter-spacing: -4px; }
	.station-description { max-width: 330px; color: #77766f; font-size: 14px; line-height: 1.7; margin: 19px 0 0; }
	.now-playing { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 20px 0; }
	.track-info { display: flex; flex-direction: column; gap: 6px; }
	.section-label { color: #99968d; font-size: 8px; letter-spacing: 1.7px; margin-bottom: 3px; }
	.track-info strong { font-size: 14px; font-weight: 650; }
	.track-subtitle { color: #949188; font-size: 11px; }
	.waveform { display: flex; align-items: center; justify-content: flex-end; gap: 3px; height: 34px; flex: 0 0 102px; }
	.waveform span { display: block; width: 2px; height: var(--bar-height); max-height: 29px; border-radius: 2px; background: #e8ad8a; animation: wave 1.15s ease-in-out infinite alternate; animation-delay: calc(var(--i) * -70ms); transform-origin: center; }
	.waveform span:nth-child(3n) { background: var(--orange); }
	.divider { height: 1px; background: #dedbd1; }
	.autoplay-note { margin: 17px 0 0; color: #96938a; font-size: 10px; }
	.autoplay-note span { color: var(--orange); padding-right: 4px; }
	.connection-details { margin-top: 25px; border-top: 1px solid #dedbd1; padding-top: 15px; color: #77766f; }
	.connection-details summary { width: fit-content; cursor: pointer; font: 9px "SFMono-Regular", Consolas, monospace; letter-spacing: .8px; }
	.connection-content { padding-top: 14px; }
	.peer-id-row { display: flex; flex-direction: column; gap: 7px; margin: 0 0 15px; }
	.peer-id-row > span, .peer-form label { color: #99968d; font: 8px "SFMono-Regular", Consolas, monospace; letter-spacing: 1px; text-transform: uppercase; }
	.peer-id-row code { overflow-wrap: anywhere; color: #64625b; font-size: 10px; }
	.peer-form-controls { display: flex; gap: 8px; margin-top: 8px; }
	.peer-form input { flex: 1; min-width: 0; border: 1px solid #dedbd1; border-radius: 2px; padding: 9px 10px; color: var(--ink); background: #f8f6f0; font-size: 11px; }
	.peer-form input:focus-visible, .peer-form button:focus-visible { outline: 2px solid var(--orange); outline-offset: 2px; }
	.peer-form button { border: 0; border-radius: 2px; padding: 0 14px; color: #fff8ef; background: var(--ink); cursor: pointer; font-size: 10px; }
	.peer-form button:hover { background: #45433e; }

	.footer { min-height: 67px; border-top: 1px solid #dedbd1; color: #929087; font-size: 8px; letter-spacing: 1px; }
	.footer-center { color: #aaa79d; }
	.footer-flower { color: var(--orange); font-size: 12px; vertical-align: -1px; }
	@keyframes breathe { 50% { opacity: .35; transform: scale(.8); } }
	@keyframes wave { from { transform: scaleY(.55); opacity: .65; } to { transform: scaleY(1); opacity: 1; } }

	@media (min-width: 1400px) { .radio { gap: 130px; } }
	@media (max-width: 760px) {
		.page-shell { padding: 0 24px; }
		.topbar { height: 72px; }
		.topbar-note { font-size: 8px; letter-spacing: .6px; }
		.radio { width: min(100%, 500px); grid-template-columns: 1fr; gap: 38px; padding: 38px 0 48px; }
		.artwork { width: min(100%, 380px); margin: 0 auto; }
		.station-copy { padding-top: 28px; }
		h1 { font-size: clamp(48px, 11vw, 68px); }
		.footer { min-height: 58px; }
		.footer-center { display: none; }
	}
	@media (max-width: 420px) {
		.page-shell { padding: 0 20px; }
		.topbar-note { font-size: 7px; }
		.waveform { flex-basis: 78px; gap: 2px; }
		.waveform span { width: 2px; }
	}
	@media (prefers-reduced-motion: reduce) {
		*, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
	}
</style>
