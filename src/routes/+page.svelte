<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { isAuthenticated, isPlaylistSelectorOpen } from '$lib/stores';
	import { initializationService } from '$lib/initializationService';
	import Auth from '$lib/components/Auth.svelte';
	import PlaylistSelector from '$lib/components/PlaylistSelector.svelte';
	import Player from '$lib/components/Player.svelte';
	import TrackList from '$lib/components/TrackList.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import Footer from '$lib/components/Footer.svelte';

	onMount(async () => {
		console.log('Main app mounted, initializing...');
		await initializationService.initialize();
	});

	onDestroy(() => {
		initializationService.destroy();
	});

	function openPlaylistSelector() {
		isPlaylistSelectorOpen.set(true);
	}
</script>

<svelte:head>
	<title>Motify - Spotify Playlist Manager</title>
	<meta name="description" content="Manage your Spotify playlists with ease" />
</svelte:head>

{#if $isAuthenticated}
	<main class="main-app">
		<div class="container">
			<header class="app-header">
				<h1>
					<i class="fab fa-spotify"></i>
					Motify
				</h1>
				<button class="playlist-selector-btn" on:click={openPlaylistSelector}>
					<i class="fas fa-list"></i>
					Playlists
				</button>
			</header>

			{#if $isPlaylistSelectorOpen}
				<PlaylistSelector />
			{/if}
			<Player />
			<TrackList />
			<Footer />
		</div>
	</main>
	<Toast />
{:else}
	<Auth />
{/if}

<style>
	.main-app {
		min-height: 100vh;
		padding: 2rem;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
	}

	.app-header {
		text-align: center;
		position: relative;
	}

	.app-header h1 {
		font-size: 3rem;
		font-weight: 700;
		background: linear-gradient(45deg, #1db954, #1ed760);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
	}

	.app-header i {
		color: #1db954;
	}

	.playlist-selector-btn {
		position: absolute;
		top: 50%;
		right: 0;
		transform: translateY(-50%);
		background: rgba(29, 185, 84, 0.1);
		color: #1db954;
		border: 1px solid rgba(29, 185, 84, 0.3);
		border-radius: 8px;
		padding: 0.75rem 1rem;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 1rem;
		font-weight: 600;
	}

	.playlist-selector-btn:hover {
		background: rgba(29, 185, 84, 0.2);
		border-color: #1db954;
	}

	@media (max-width: 768px) {
		.main-app {
			padding: 0;
		}

		.app-header h1 {
			font-size: 2rem;
		}

		.playlist-selector-btn {
			position: static;
			transform: none;
			margin-top: 1rem;
		}
	}
</style>
