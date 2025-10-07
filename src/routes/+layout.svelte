<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import '@fortawesome/fontawesome-free/css/all.min.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<script>
		window.onSpotifyWebPlaybackSDKReady = () => {
			console.log('Spotify Web Playback SDK is ready');
		};
	</script>
	<script src="https://sdk.scdn.co/spotify-player.js"></script>
</svelte:head>

<div class="app-container">
	{@render children?.()}
</div>

<style>
	:global(body) {
		margin: 0;
		background-color: #121212ff;
		color: #f3f3f3ff;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		min-width: 375px
	}

	.app-container {
		min-height: 100vh;
	}
</style>
