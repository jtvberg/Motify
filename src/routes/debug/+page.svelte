<script lang="ts">
	import { onMount } from 'svelte';
	import { webPlaybackService } from '$lib/webPlayback';
	import { currentTrack, isPlaying, user } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';

	let logs: string[] = [];
	let playbackState: any = null;
	let availableDevices: any = null;

	function addLog(message: string) {
		logs = [...logs, `${new Date().toLocaleTimeString()}: ${message}`];
		console.log(message);
	}

	onMount(() => {
		addLog('Debug page mounted');
		
		// Check if Spotify Web Playback SDK is loaded
		if (typeof window !== 'undefined' && window.Spotify) {
			addLog('Spotify Web Playback SDK is loaded');
		} else {
			addLog('Spotify Web Playback SDK is NOT loaded');
		}

		// Check if user is authenticated
		if ($user) {
			addLog(`User authenticated: ${$user.display_name}`);
		} else {
			addLog('User not authenticated');
		}

		// Check current track
		if ($currentTrack) {
			addLog(`Current track: ${$currentTrack.name} by ${$currentTrack.artists[0].name}`);
		} else {
			addLog('No current track');
		}

		addLog(`Is playing: ${$isPlaying}`);
	});

	async function testWebPlaybackInit() {
		try {
			addLog('Testing Web Playback SDK initialization...');
			const token = localStorage.getItem('spotify_access_token');
			if (!token) {
				addLog('No access token found');
				return;
			}
			
			addLog('Access token found, initializing...');
			await webPlaybackService.initialize();
			addLog('Web Playback SDK initialized successfully');
		} catch (error) {
			addLog(`Error initializing Web Playback SDK: ${error}`);
		}
	}

	async function getPlaybackState() {
		try {
			const state = await webPlaybackService.getCurrentState();
			playbackState = state;
			if (state) {
				addLog(`Playback state retrieved: ${state.track_window.current_track.name}`);
			} else {
				addLog('No playback state available');
			}
		} catch (error) {
			addLog(`Error getting playback state: ${error}`);
		}
	}

	async function testPlay() {
		try {
			addLog('Testing play...');
			await webPlaybackService.play();
			addLog('Play command sent');
		} catch (error) {
			addLog(`Error playing: ${error}`);
		}
	}

	async function testPause() {
		try {
			addLog('Testing pause...');
			await webPlaybackService.pause();
			addLog('Pause command sent');
		} catch (error) {
			addLog(`Error pausing: ${error}`);
		}
	}

	async function getAvailableDevices() {
		try {
			const devices = await spotifyAPI.getAvailableDevices();
			availableDevices = devices;
			addLog(`Available devices retrieved: ${devices.devices?.length || 0} devices`);
		} catch (error) {
			addLog(`Error getting devices: ${error}`);
		}
	}
</script>

<div class="debug-container">
	<h1>Debug Page</h1>
	
	<div class="controls">
		<button on:click={testWebPlaybackInit}>Initialize Web Playback SDK</button>
		<button on:click={getPlaybackState}>Get Playback State</button>
		<button on:click={getAvailableDevices}>Get Available Devices</button>
		<button on:click={testPlay}>Test Play</button>
		<button on:click={testPause}>Test Pause</button>
	</div>

	<div class="logs">
		<h2>Logs:</h2>
		{#each logs as log}
			<div class="log-entry">{log}</div>
		{/each}
	</div>

	{#if availableDevices}
		<div class="available-devices">
			<h2>Available Devices:</h2>
			<pre>{JSON.stringify(availableDevices, null, 2)}</pre>
		</div>
	{/if}

	{#if playbackState}
		<div class="playback-state">
			<h2>Playback State:</h2>
			<pre>{JSON.stringify(playbackState, null, 2)}</pre>
		</div>
	{/if}
</div>

<style>
	.debug-container {
		padding: 20px;
		max-width: 800px;
		margin: 0 auto;
	}

	.controls {
		margin: 20px 0;
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	button {
		padding: 10px 15px;
		background: #1db954;
		color: white;
		border: none;
		border-radius: 5px;
		cursor: pointer;
	}

	button:hover {
		background: #1ed760;
	}

	.logs {
		margin: 20px 0;
		background: #2a2a2a;
		padding: 15px;
		border-radius: 5px;
		max-height: 400px;
		overflow-y: auto;
	}

	.log-entry {
		font-family: monospace;
		font-size: 12px;
		margin: 5px 0;
		color: #fff;
	}

	.available-devices {
		margin: 20px 0;
		background: #2a2a2a;
		padding: 15px;
		border-radius: 5px;
	}

	.playback-state {
		margin: 20px 0;
		background: #2a2a2a;
		padding: 15px;
		border-radius: 5px;
	}

	pre {
		color: #fff;
		font-size: 12px;
		overflow-x: auto;
	}

	h1, h2 {
		color: #fff;
	}
</style>
