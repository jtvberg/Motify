<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { isPlaying, currentTrack, playbackPosition, trackDuration, currentTracks, currentTrackIndex, selectedPlaylist, targetPlaylist } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import { toastStore } from '$lib/toast';
	import { tokenManager } from '$lib/tokenManager';
	import { 
		formatTime,
		togglePlayback,
		playPreviousTrack,
		playNextTrack,
		removeTrack,
		moveTrack
	} from '$lib/utils';

	let progressBar: HTMLInputElement;
	let isDragging = false;
	let updateInterval: number;
	let positionUpdateInterval: number = 0;
	let isPlayerReady = false;

	$: progress = $trackDuration > 0 ? ($playbackPosition / $trackDuration) * 100 : 0;

	const stores = {
		isPlaying,
		currentTrack,
		currentTracks,
		currentTrackIndex,
		playbackPosition,
		trackDuration,
		selectedPlaylist,
		targetPlaylist
	};

	const services = {
		spotifyAPI,
		webPlaybackService,
		toastStore
	};

	async function handleAPIError<T>(apiCall: () => Promise<T>): Promise<T | null> {
		try {
			const tokenValid = await tokenManager.checkAndRefreshToken();
			if (!tokenValid) {
				console.error('Invalid token, cannot make API call');
				return null;
			}
			
			return await apiCall();
		} catch (error) {
			console.error('API call failed:', error);

			if (error instanceof Error && error.message.includes('401')) {
				try {
					console.log('Retrying API call after token refresh...');
					await tokenManager.checkAndRefreshToken();
					return await apiCall();
				} catch (retryError) {
					console.error('Retry failed:', retryError);
					return null;
				}
			}
			
			return null;
		}
	}

	onMount(async () => {
		if (webPlaybackService.getDeviceId()) {
			isPlayerReady = true;
			console.log('Web Playback SDK already initialized');
			startPositionUpdates();
		} else {
			const checkInitialization = setInterval(() => {
				if (webPlaybackService.getDeviceId()) {
					isPlayerReady = true;
					console.log('Web Playback SDK detected as ready');
					startPositionUpdates();
					clearInterval(checkInitialization);
				}
			}, 100);

			setTimeout(() => {
				if (!isPlayerReady) {
					console.log('Web Playback SDK not ready, falling back to API polling');
					clearInterval(checkInitialization);
					updateInterval = setInterval(updatePlaybackState, 1000);
				}
			}, 10000);
		}
	});

	onDestroy(() => {
		if (updateInterval) {
			clearInterval(updateInterval);
		}
		if (positionUpdateInterval) {
			clearInterval(positionUpdateInterval);
		}
	});

	async function updatePlaybackState() {
		if (isDragging) return;
		
		try {
			const state = await spotifyAPI.getPlaybackState();
			if (state && state.item) {
				currentTrack.set(state.item);
				isPlaying.set(state.is_playing);
				playbackPosition.set(state.progress_ms / 1000);
				trackDuration.set(state.item.duration_ms / 1000);
			}
		} catch (error) {
			console.error('Failed to get playback state:', error);
		}
	}

	function startPositionUpdates() {
		if (positionUpdateInterval) {
			clearInterval(positionUpdateInterval);
		}

		positionUpdateInterval = setInterval(async () => {
			if (isDragging || !isPlayerReady || !$isPlaying) return;
			
			try {
				const state = await webPlaybackService.getCurrentState();
				if (state && state.track_window.current_track) {
					const currentTrackUri = $currentTrack?.uri;
					const stateTrackUri = state.track_window.current_track.uri;
					
					if (currentTrackUri === stateTrackUri) {
						const newPosition = state.position / 1000;
						const currentPosition = $playbackPosition;
						if (newPosition >= currentPosition - 2 || Math.abs(newPosition - currentPosition) > 5) {
							playbackPosition.set(newPosition);
						}
					}
				}
			} catch (error) {
				console.error('Failed to get current position:', error);
			}
		}, 1000);
	}

	function stopPositionUpdates() {
		if (positionUpdateInterval) {
			clearInterval(positionUpdateInterval);
			positionUpdateInterval = 0;
		}
	}

	$: if (isPlayerReady) {
		if ($isPlaying) {
			if (!positionUpdateInterval) {
				startPositionUpdates();
			}
		} else {
			stopPositionUpdates();
		}
	}

	$: if ($currentTrack && $currentTracks.length > 0) {
		const trackIndex = $currentTracks.findIndex(t => t.id === $currentTrack.id);
		if (trackIndex >= 0 && trackIndex !== $currentTrackIndex) {
			currentTrackIndex.set(trackIndex);
		}
	}

	async function togglePlaybackHandler() {
		await togglePlayback(stores, services, isPlayerReady);
	}

	async function previousTrack() {
		await playPreviousTrack(stores, services, isPlayerReady, stopPositionUpdates, startPositionUpdates, updatePlaybackState);
	}

	async function nextTrack() {
		await playNextTrack(stores, services, isPlayerReady, stopPositionUpdates, startPositionUpdates, updatePlaybackState);
	}

	async function removeCurrentTrack() {
		if (!$currentTrack || !$currentTracks.length) {
			console.log('No current track to remove');
			return;
		}

		const updatedTracks = await removeTrack($currentTrack, $currentTracks, stores, services, handleAPIError);
	}

	async function moveCurrentTrack() {
		if (!$currentTrack || !$currentTracks.length) {
			console.log('No current track to move');
			return;
		}

		if (!$targetPlaylist) {
			console.log('No target playlist selected');
			return;
		}

		const updatedTracks = await moveTrack($currentTrack, $currentTracks, stores, services, handleAPIError);
	}

	function handleSeekStart() {
		isDragging = true;
	}

	async function handleSeek(event: Event) {
		const target = event.target as HTMLInputElement;
		const position = (parseFloat(target.value) / 100) * $trackDuration;
		playbackPosition.set(position);
		
		try {
			if (isPlayerReady) {
				await webPlaybackService.seek(position * 1000);
			} else {
				await spotifyAPI.seekToPosition(position * 1000);
			}
		} catch (error) {
			console.error('Failed to seek:', error);
		}
		
		isDragging = false;
	}
</script>

{#if $currentTrack}
	<div class="player">
		<div class="track-info">
			<img 
				src={$currentTrack.album.images[0]?.url} 
				alt="Album cover"
				class="album-cover"
			/>
		</div>

		<div class="player-controls">
			<div class="track-details">
				<div class="track-name">{$currentTrack.name}</div>
				<div class="artist-name">{$currentTrack.artists.map(a => a.name).join(', ')}</div>
				{#if $currentTracks.length > 0 && $currentTrackIndex >= 0}
					<div class="playlist-position">
						Track {$currentTrackIndex + 1} of {$currentTracks.length}
					</div>
				{/if}
			</div>
			<div class="control-buttons">
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="track-button track-remove far fa-trash-can fa-xl" role="button" on:click={removeCurrentTrack} aria-label="Remove track"></div>
				<button class="control-btn" on:click={previousTrack} aria-label="Previous track">
					<i class="fas fa-step-backward"></i>
				</button>
				<button class="play-btn" on:click={togglePlaybackHandler} aria-label={$isPlaying ? 'Pause' : 'Play'}>
					<i class="fas {$isPlaying ? 'fa-pause' : 'fa-play'}"></i>
				</button>
				<button class="control-btn" on:click={nextTrack} aria-label="Next track">
					<i class="fas fa-step-forward"></i>
				</button>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				{#if $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
					<div class="track-button track-move far fa-square-plus fa-xl" role="button" on:click={moveCurrentTrack} aria-label="Move track to target playlist"></div>
				{:else}
					<div 
						class="track-button track-move far fa-square-plus fa-xl track-button-disabled" 
						aria-label="Move track to target playlist"
						title={$targetPlaylist ? 'Select a different target playlist to enable moving tracks' : 'Select a target playlist to enable moving tracks'}
					></div>
				{/if}
			</div>

			<div class="progress-container">
				<span class="time">{formatTime($playbackPosition)}</span>
				<input
					type="range"
					min="0"
					max="100"
					value={progress}
					class="progress-bar"
					bind:this={progressBar}
					on:mousedown={handleSeekStart}
					on:touchstart={handleSeekStart}
					on:change={handleSeek}
				/>
				<span class="time">{formatTime($trackDuration)}</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.player {
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(20px);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.track-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		min-width: 0;
	}

	.album-cover {
		width: 200px;
		height: 200px;
		border-radius: 8px;
		object-fit: cover;
	}

	.track-details {
		min-width: 0;
		flex: 1;
	}

	.track-name {
		font-weight: 600;
		font-size: 1.5rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 0.25rem;
	}

	.artist-name {
		color: #b3b3b3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.playlist-position {
		color: #1db954;
		font-size: 0.8rem;
		margin-top: 0.25rem;
	}

	.player-controls {
		flex: 2;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.control-buttons {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
	}

	.control-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		border: none;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: 2px;
	}

	.play-btn {
		background: #1db954;
		color: black;
		border: none;
		width: 50px;
		height: 50px;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
	}

	.track-button {
		color: #b3b3b3;
		cursor: pointer;
		transition: color 0.3s ease;
		margin-inline: 1rem;
	}

	.track-button-disabled {
		opacity: 0.5;
		cursor: not-allowed !important;
		color: #666666 !important;
	}

	.progress-container {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.time {
		font-size: 0.9rem;
		color: #b3b3b3;
		min-width: 40px;
		text-align: center;
	}

	.progress-bar {
		flex: 1;
		height: 4px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		outline: none;
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
	}

	.progress-bar::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #1db954;
		cursor: pointer;
		border: 2px solid #ffffff;
	}

	.progress-bar::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #1db954;
		cursor: pointer;
		border: 2px solid #ffffff;
	}

	@media (max-width: 768px) {
		.player {
			flex-direction: column;
			gap: 1rem;
		}

		.track-info {
			width: 100%;
		}

		.track-details {
			display: flex;
			min-width: 0;
			flex: 1;
			flex-direction: column;
			align-items: center;
		}

		.player-controls {
			width: 100%;
		}
	}

	@media (hover: hover) {
		.control-btn:hover {
			background: rgba(255, 255, 255, 0.2);
			transform: scale(1.1);
		}

		.play-btn:hover {
			background: #1ed760;
			transform: scale(1.1);
		}

		.track-remove:hover {
			color: rgba(255, 69, 58, 1);
		}

		.track-move:hover {
			color: rgba(0, 122, 255, 0.8);
		}

		.track-button-disabled:hover {
			color: #666666 !important;
			transform: none !important;
		}
	}
</style>
