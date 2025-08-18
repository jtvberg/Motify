<script lang="ts">
	import { onMount } from 'svelte';
	import { isAuthenticated } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import Auth from '$lib/components/Auth.svelte';
	import PlaylistSelector from '$lib/components/PlaylistSelector.svelte';
	import Player from '$lib/components/Player.svelte';
	import TrackList from '$lib/components/TrackList.svelte';

	onMount(async () => {
		console.log('Main app mounted, checking authentication...');
		
		// Check if user is already authenticated with valid token
		try {
			const token = await spotifyAPI.ensureValidToken();
			if (token) {
				console.log('User is authenticated with valid token');
				isAuthenticated.set(true);
				
				// Initialize Web Playback SDK after authentication
				try {
					console.log('Initializing Web Playback SDK...');
					await webPlaybackService.initialize();
					console.log('Web Playback SDK ready');
					
					// Wait a bit for the device to be ready
					setTimeout(() => {
						const deviceId = webPlaybackService.getDeviceId();
						console.log('Device ID after initialization:', deviceId);
					}, 2000);
				} catch (error) {
					console.error('Failed to initialize Web Playback SDK:', error);
				}
			} else {
				console.log('No valid token available, user needs to authenticate');
				isAuthenticated.set(false);
			}
		} catch (error) {
			console.error('Error checking authentication:', error);
			isAuthenticated.set(false);
		}
	});
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
				<p>Your Spotify Playlist Manager</p>
			</header>

			<PlaylistSelector />
			<Player />
			<TrackList />
		</div>
	</main>
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
		margin-bottom: 3rem;
	}

	.app-header h1 {
		font-size: 3rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(45deg, #1db954, #1ed760);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.app-header p {
		font-size: 1.2rem;
		color: #b3b3b3;
		margin: 0;
	}

	.app-header i {
		color: #1db954;
	}

	@media (max-width: 768px) {
		.main-app {
			padding: 1rem;
		}

		.app-header h1 {
			font-size: 2rem;
		}
	}
</style>
