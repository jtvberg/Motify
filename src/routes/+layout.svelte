<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import '@fortawesome/fontawesome-free/css/all.min.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<script src="https://sdk.scdn.co/spotify-player.js"></script>
</svelte:head>

<div class="app-container">
	{@render children?.()}
</div>

<style>
	:global(body) {
		margin: 0;
		background-color: #121212;
		color: #ffffff;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.app-container {
		min-height: 100vh;
		background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
	}
</style>
