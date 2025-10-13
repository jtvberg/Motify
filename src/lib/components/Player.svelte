<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { isPlaying, currentTrack, playbackPosition, trackDuration, currentTracks, originalTrackOrder, currentTrackIndex, selectedPlaylist, targetPlaylist, userLibrary, isLibraryLoading, isShuffleOn } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import { toastStore } from '$lib/toast';
	import { tokenManager } from '$lib/tokenManager';
	import { 
		formatTime,
		shuffleArray,
		togglePlayback,
		playPreviousTrack,
		playNextTrack,
		removeTrack,
		moveTrack,
		copyTrack,
		toggleTrackInLibrary
	} from '$lib/utils';

	let progressBar: HTMLInputElement;
	let isDragging = false;
	let updateInterval: number;
	let positionUpdateInterval: number = 0;
	let isPlayerReady = false;

	$: progress = $trackDuration > 0 ? ($playbackPosition / $trackDuration) * 100 : 0;
	$: isTrackInLibrary = (trackId: string): boolean => {
		return $userLibrary.has(trackId);
	};

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


	async function copyCurrentTrack() {
		if (!$currentTrack || !$currentTracks.length) {
			console.log('No current track to move');
			return;
		}

		if (!$targetPlaylist) {
			console.log('No target playlist selected');
			return;
		}

		const updatedTracks = await copyTrack($currentTrack, $currentTracks, stores, services, handleAPIError);
	}

	async function addCurrentTrack() {
		if (!$currentTrack) {
			console.log('No current track to add to library');
			return;
		}

		await toggleTrackInLibrary($currentTrack, services);
	}

	async function toggleShuffle() {
		const newShuffleState = !$isShuffleOn;
		
		if (newShuffleState) {
			// Shuffling ON: Save original order and shuffle
			console.log('Enabling shuffle - saving original order and shuffling tracks');
			
			// Save the original order if not already saved
			if ($originalTrackOrder.length === 0) {
				originalTrackOrder.set([...$currentTracks]);
			}
			
			// Find current track before shuffling
			const currentTrackId = $currentTrack?.id;
			
			// Shuffle the tracks
			const shuffled = shuffleArray($currentTracks);
			currentTracks.set(shuffled);
			
			// Update the current track index to match the new position
			if (currentTrackId) {
				const newIndex = shuffled.findIndex(t => t.id === currentTrackId);
				if (newIndex >= 0) {
					currentTrackIndex.set(newIndex);
				}
			}
			
			console.log('Tracks shuffled. Original count:', $originalTrackOrder.length, 'Shuffled count:', shuffled.length);
		} else {
			// Shuffling OFF: Restore original order
			console.log('Disabling shuffle - restoring original order');
			
			if ($originalTrackOrder.length > 0) {
				const currentTrackId = $currentTrack?.id;
				
				// Restore original order
				currentTracks.set([...$originalTrackOrder]);
				
				// Update the current track index to match the original position
				if (currentTrackId) {
					const originalIndex = $originalTrackOrder.findIndex(t => t.id === currentTrackId);
					if (originalIndex >= 0) {
						currentTrackIndex.set(originalIndex);
					}
				}
				
				console.log('Original order restored. Track count:', $originalTrackOrder.length);
			}
		}
		
		isShuffleOn.set(newShuffleState);
		console.log('Shuffle toggled:', newShuffleState);
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
			<div class="control-btns">
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="track-btn track-remove far fa-trash-can fa-xl"
					role="button"
					on:click={removeCurrentTrack}
					aria-label="Remove track"
					title="Remove track from playlist"
				></div>
				{#if $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
					<!-- svelte-ignore a11y_interactive_supports_focus -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="track-btn track-move fa fa-plus-minus fa-xl"
						role="button"
						on:click={moveCurrentTrack}
						aria-label="Move track to target playlist"
						title="Move track to target playlist"
					></div>
				{:else}
					<div
						class="track-btn track-move fa fa-plus-minus fa-xl track-btn-disabled" 
						aria-label="Move track to target playlist"
						title={$targetPlaylist ? 'Select a different target playlist to enable moving tracks' : 'Select a target playlist to enable moving tracks'}
					></div>
				{/if}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="control-btn fas fa-step-backward fa-xl"
					role="button"
					on:click={previousTrack}
					aria-label="Previous track"
					title="Previous track"
				></div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div 
					class="play-btn fas fa-2xl' {$isPlaying ? 'fa-circle-pause' : 'fa-circle-play'}"
					role="button"
					on:click={togglePlaybackHandler}
					aria-label={$isPlaying ? 'Pause' : 'Play'}
					title={$isPlaying ? 'Pause' : 'Play'}
				></div>
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="control-btn fas fa-step-forward fa-xl"
					role="button"
					on:click={nextTrack}
					aria-label="Next track"
					title="Next track"
				></div>
				{#if $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
					<!-- svelte-ignore a11y_interactive_supports_focus -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="track-btn track-copy far fa-square-plus fa-xl"
						role="button"
						on:click={copyCurrentTrack}
						aria-label="Copy track to target playlist"
						title="Copy track to target playlist"
					></div>
				{:else}
					<div
						class="track-btn track-copy far fa-square-plus fa-xl track-btn-disabled" 
						aria-label="Copy track to target playlist"
						title={$targetPlaylist ? 'Select a different target playlist to enable copying tracks' : 'Select a target playlist to enable copying tracks'}
					></div>
				{/if}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="track-btn track-add {$isLibraryLoading ? 'fas fa-spinner fa-spin-pulse fa-xl track-btn-disabled' : ($currentTrack && isTrackInLibrary($currentTrack.id) ? 'fas' : 'far') + ' fa-heart fa-xl ' + ($currentTrack && isTrackInLibrary($currentTrack.id) ? 'in-library' : '')}"
					role="button"
					on:click={$isLibraryLoading ? null : addCurrentTrack}
					aria-label={$isLibraryLoading ? 'Loading library...' : ($currentTrack && isTrackInLibrary($currentTrack.id) ? 'Remove from library' : 'Add to library')}
					title={$isLibraryLoading ? 'Loading library...' : ($currentTrack && isTrackInLibrary($currentTrack.id) ? 'Remove from library' : 'Add to library')}
				></div>
			</div>
			<div class="progress-container">
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div 
					class="playback-btn repeat-btn fa fa-repeat"
					role="button"
					on:click={previousTrack}
					aria-label="Repeat"
					title="Repeat"
				></div>
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
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="playback-btn shuffle-btn fa fa-shuffle {$isShuffleOn ? 'shuffle-active' : ''}"
					role="button"
					on:click={toggleShuffle}
					aria-label="Shuffle playlist"
					title="Shuffle {$isShuffleOn ? 'on' : 'off'}"
				></div>
			</div>
		</div>
	</div>
{/if}

<style>
	.player {
		background: #000000cc;
		backdrop-filter: blur(20px);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		border: 1px solid #1e1e1eff;
	}

	.track-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
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
		width: 100%;
	}

	.artist-name {
		color: #b3b3b3ff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 100%;
	}

	.playlist-position {
		color: #1db954ff;
		font-size: 0.8rem;
		margin-top: 0.25rem;
	}

	.player-controls {
		flex: 2;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 1px;
	}

	.control-btns {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
	}

	.control-btn {
		cursor: pointer;
		color: #ffffffff;
		transition: all 0.3s ease;
	}

	.play-btn {
		color: #1db954ff;
		transition: all 0.3s ease;
		font-size: 3rem;
		cursor: pointer;
	}

	.track-btn {
		color: #b3b3b3ff;
		cursor: pointer;
		transition: color 0.3s ease;
	}

	.track-remove, .track-move {
		margin-right: 1rem;
	}

	.track-copy, .track-add {
		margin-left: 1rem;
	}

	.track-btn-disabled {
		opacity: 0.5;
		cursor: not-allowed !important;
		color: #666666ff !important;
	}

	.track-add.in-library {
		color: #1db954ff;
	}

	.progress-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.playback-btn {
		color: #b3b3b3ff;
		font-size: 1.2rem;
		cursor: pointer;
		transition: color 0.3s ease;
	}

	.shuffle-active {
		color: #1db954ff !important;
	}

	.time {
		font-size: 0.9rem;
		color: #b3b3b3ff;
		min-width: 40px;
		text-align: center;
	}

	.progress-bar {
		flex: 1;
		height: 4px;
		background: #ffffff33;
		border-radius: 2px;
		outline: none;
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
	}

	.progress-bar::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #1db954ff;
		cursor: pointer;
		border: 2px solid #ffffffff;
	}

	.progress-bar::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #1db954ff;
		cursor: pointer;
		border: 2px solid #ffffffff;
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

		.track-name, .artist-name {
			text-align: center;
		}

		.player-controls {
			width: 100%;
		}
	}

	@media (hover: hover) {
		.control-btn:hover {
			transform: scale(1.1);
		}

		.play-btn:hover {
			transform: scale(1.1);
		}

		.track-btn:hover {
			color: #1db954ff;
		}

		.track-btn-disabled:hover {
			color: #666666ff !important;
			transform: none !important;
		}

		.playback-btn:hover {
			color: #ffffffff;
		}
	}
</style>
