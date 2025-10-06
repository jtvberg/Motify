<script lang="ts">
	import { onMount } from 'svelte';
	import { webPlaybackService } from '$lib/webPlayback';
	import { currentTrack, isPlaying, user } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { initializationService } from '$lib/initializationService';
	import { scrapeEveryNoiseTrackIds } from '$lib/utils';

	let logs: string[] = [];
	let playbackState: any = null;
	let availableDevices: any = null;
	let everynoiseTrackIds: string[] = [];
	let testPlaylistId = '37i9dQZEVXcQ9BlMOo4hbb'; // Default test playlist ID

	function addLog(message: string) {
		logs = [...logs, `${new Date().toLocaleTimeString()}: ${message}`];
		console.log(message);
	}

	onMount(() => {
		addLog('Debug page mounted');

		if (initializationService.isAppInitialized()) {
			addLog('App is initialized');
		} else {
			addLog('App is NOT initialized');
		}

		if (typeof window !== 'undefined' && window.Spotify) {
			addLog('Spotify Web Playback SDK is loaded');
		} else {
			addLog('Spotify Web Playback SDK is NOT loaded');
		}

		if (initializationService.isWebPlaybackReady()) {
			addLog('Web Playback SDK is ready');
		} else {
			addLog('Web Playback SDK is NOT ready');
		}

		if ($user) {
			addLog(`User authenticated: ${$user.display_name}`);
		} else {
			addLog('User not authenticated');
		}

		if ($currentTrack) {
			addLog(`Current track: ${$currentTrack.name} by ${$currentTrack.artists[0].name}`);
		} else {
			addLog('No current track');
		}

		addLog(`Is playing: ${$isPlaying}`);
	});

	async function testWebPlaybackInit() {
		try {
			addLog('Testing app initialization...');
			const success = await initializationService.initialize();
			if (success) {
				addLog('App initialization completed successfully');
			} else {
				addLog('App initialization failed or user not authenticated');
			}
		} catch (error) {
			addLog(`Error during initialization: ${error}`);
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

	async function testEveryNoiseScraper() {
		try {
			addLog(`Testing EveryNoise scraper with playlist ID: ${testPlaylistId}`);
			const trackIds = await scrapeEveryNoiseTrackIds(testPlaylistId);
			everynoiseTrackIds = trackIds;
			addLog(`Successfully scraped ${trackIds.length} track IDs`);
			console.log('Track IDs array:', trackIds);
		} catch (error) {
			addLog(`Error scraping: ${error}`);
		}
	}
</script>

<div class="debug-container">
	<h1>Debug Page</h1>
	
	<div class="controls">
		<button on:click={testWebPlaybackInit}>Test App Initialization</button>
		<button on:click={getPlaybackState}>Get Playback State</button>
		<button on:click={getAvailableDevices}>Get Available Devices</button>
		<button on:click={testPlay}>Test Play</button>
		<button on:click={testPause}>Test Pause</button>
	</div>

	<div class="everynoise-section">
		<h2>EveryNoise Track Scraper Test</h2>
		<div class="input-group">
			<label for="playlist-id">Playlist ID:</label>
			<input 
				id="playlist-id"
				type="text" 
				bind:value={testPlaylistId} 
				placeholder="Enter Spotify playlist ID"
			/>
		</div>
		<button on:click={testEveryNoiseScraper}>Test EveryNoise Scraper</button>
		
		{#if everynoiseTrackIds.length > 0}
			<div class="track-ids-result">
				<h3>Scraped Track IDs ({everynoiseTrackIds.length}):</h3>
				<div class="track-ids-list">
					{#each everynoiseTrackIds as trackId, index}
						<div class="track-id-item">{index + 1}. {trackId}</div>
					{/each}
				</div>
			</div>
		{/if}
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
		background: #1db954ff;
		color: #f3f3f3ff;
		border: none;
		border-radius: 5px;
		cursor: pointer;
	}

	button:hover {
		background: #1ed760ff;
	}

	.logs {
		margin: 20px 0;
		background: #2a2a2aff;
		padding: 15px;
		border-radius: 5px;
		max-height: 400px;
		overflow-y: auto;
	}

	.log-entry {
		font-family: monospace;
		font-size: 12px;
		margin: 5px 0;
		color: #ffffffff;
	}

	.available-devices {
		margin: 20px 0;
		background: #2a2a2aff;
		padding: 15px;
		border-radius: 5px;
	}

	.playback-state {
		margin: 20px 0;
		background: #2a2a2aff;
		padding: 15px;
		border-radius: 5px;
	}

	pre {
		color: #fff;
		font-size: 12px;
		overflow-x: auto;
	}

	h1, h2 {
		color: #ffffffff;
	}

	.everynoise-section {
		margin: 20px 0;
		padding: 20px;
		background: #1a1a1aff;
		border-radius: 8px;
		border: 1px solid #333333ff;
	}

	.everynoise-section h2 {
		margin-top: 0;
		color: #1db954ff;
	}

	.input-group {
		margin: 15px 0;
	}

	.input-group label {
		display: block;
		margin-bottom: 5px;
		color: #fff;
		font-weight: bold;
	}

	.input-group input {
		width: 100%;
		max-width: 400px;
		padding: 10px;
		border: 1px solid #444444ff;
		border-radius: 4px;
		background: #2a2a2aff;
		color: #ffffffff;
		font-size: 14px;
	}

	.input-group input:focus {
		outline: none;
		border-color: #1db954ff;
	}

	.track-ids-result {
		margin-top: 20px;
		padding: 15px;
		background: #2a2a2aff;
		border-radius: 6px;
	}

	.track-ids-result h3 {
		margin-top: 0;
		color: #1db954ff;
	}

	.track-ids-list {
		max-height: 300px;
		overflow-y: auto;
		font-family: monospace;
		font-size: 12px;
	}

	.track-id-item {
		padding: 2px 0;
		color: #ccccccff;
	}
</style>
