<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { isPlaying, currentTrack, playbackPosition, trackDuration, currentTracks, currentTrackIndex } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import { formatTime } from '$lib/utils';

	let progressBar: HTMLInputElement;
	let isDragging = false;
	let updateInterval: number;
	let positionUpdateInterval: number = 0;
	let isPlayerReady = false;

	$: progress = $trackDuration > 0 ? ($playbackPosition / $trackDuration) * 100 : 0;

	onMount(async () => {
		// Initialize Web Playback SDK
		try {
			await webPlaybackService.initialize();
			isPlayerReady = true;
			console.log('Web Playback SDK initialized');
			
			// Start position updates for Web Playback SDK
			startPositionUpdates();
		} catch (error) {
			console.error('Failed to initialize Web Playback SDK:', error);
			// Fallback to regular API polling
			updateInterval = setInterval(updatePlaybackState, 1000);
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
		// Clear any existing interval first
		if (positionUpdateInterval) {
			clearInterval(positionUpdateInterval);
		}
		
		// Update position every second when playing and using Web Playback SDK
		positionUpdateInterval = setInterval(async () => {
			if (isDragging || !isPlayerReady || !$isPlaying) return;
			
			try {
				const state = await webPlaybackService.getCurrentState();
				if (state && state.track_window.current_track) {
					// Only update position if it's reasonable and for the same track
					const currentTrackUri = $currentTrack?.uri;
					const stateTrackUri = state.track_window.current_track.uri;
					
					if (currentTrackUri === stateTrackUri) {
						const newPosition = state.position / 1000;
						// Sanity check: don't jump backwards unless it's a big jump (seek)
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

	// React to play/pause changes to start/stop position updates
	$: if (isPlayerReady) {
		if ($isPlaying) {
			if (!positionUpdateInterval) {
				startPositionUpdates();
			}
		} else {
			stopPositionUpdates();
		}
	}

	// React to track changes to reset position and update highlight
	$: if ($currentTrack && $currentTracks.length > 0) {
		// Find and update the current track index if needed
		const trackIndex = $currentTracks.findIndex(t => t.id === $currentTrack.id);
		if (trackIndex >= 0 && trackIndex !== $currentTrackIndex) {
			currentTrackIndex.set(trackIndex);
		}
	}

	async function togglePlayback() {
		try {
			if (isPlayerReady) {
				await webPlaybackService.togglePlay();
			} else {
				if ($isPlaying) {
					await spotifyAPI.pausePlayback();
					isPlaying.set(false);
				} else {
					await spotifyAPI.resumePlayback();
					isPlaying.set(true);
				}
			}
		} catch (error) {
			console.error('Failed to toggle playback:', error);
		}
	}

	async function previousTrack() {
		try {
			const tracks = $currentTracks;
			const currentIndex = $currentTrackIndex;
			
			if (tracks.length === 0 || currentIndex < 0) {
				console.log('No playlist context for previous track');
				return;
			}
			
			// Stop current position updates immediately
			stopPositionUpdates();
			
			// Calculate previous track index (wrap around to end if at beginning)
			const previousIndex = currentIndex > 0 ? currentIndex - 1 : tracks.length - 1;
			const previousTrack = tracks[previousIndex];
			
			console.log(`Playing previous track: ${previousTrack.name} (index ${previousIndex})`);
			
			// Reset position to 0 immediately for visual feedback
			playbackPosition.set(0);
			
			// Update the index first
			currentTrackIndex.set(previousIndex);
			
			// Play the track - let the player state change event update the current track
			if (isPlayerReady) {
				await webPlaybackService.play(previousTrack.uri);
			} else {
				await spotifyAPI.playTrack(previousTrack.uri);
				// For fallback API, update the track manually since no state change event
				currentTrack.set(previousTrack);
				setTimeout(updatePlaybackState, 500);
			}
			
			// Restart position updates if playing
			if ($isPlaying && isPlayerReady) {
				startPositionUpdates();
			}
		} catch (error) {
			console.error('Failed to go to previous track:', error);
		}
	}

	async function nextTrack() {
		try {
			const tracks = $currentTracks;
			const currentIndex = $currentTrackIndex;
			
			if (tracks.length === 0 || currentIndex < 0) {
				console.log('No playlist context for next track');
				return;
			}
			
			// Stop current position updates immediately
			stopPositionUpdates();
			
			// Calculate next track index (wrap around to beginning if at end)
			const nextIndex = currentIndex < tracks.length - 1 ? currentIndex + 1 : 0;
			const nextTrack = tracks[nextIndex];
			
			console.log(`Playing next track: ${nextTrack.name} (index ${nextIndex})`);
			
			// Reset position to 0 immediately for visual feedback
			playbackPosition.set(0);
			
			// Update the index first
			currentTrackIndex.set(nextIndex);
			
			// Play the track - let the player state change event update the current track
			if (isPlayerReady) {
				await webPlaybackService.play(nextTrack.uri);
			} else {
				await spotifyAPI.playTrack(nextTrack.uri);
				// For fallback API, update the track manually since no state change event
				currentTrack.set(nextTrack);
				setTimeout(updatePlaybackState, 500);
			}
			
			// Restart position updates if playing
			if ($isPlaying && isPlayerReady) {
				startPositionUpdates();
			}
		} catch (error) {
			console.error('Failed to go to next track:', error);
		}
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
			<div class="track-details">
				<div class="track-name">{$currentTrack.name}</div>
				<div class="artist-name">{$currentTrack.artists.map(a => a.name).join(', ')}</div>
				{#if $currentTracks.length > 0 && $currentTrackIndex >= 0}
					<div class="playlist-position">
						Track {$currentTrackIndex + 1} of {$currentTracks.length}
					</div>
				{/if}
			</div>
		</div>

		<div class="player-controls">
			<div class="control-buttons">
				<button class="control-btn" on:click={previousTrack} aria-label="Previous track">
					<i class="fas fa-step-backward"></i>
				</button>
				<button class="play-btn" on:click={togglePlayback} aria-label={$isPlaying ? 'Pause' : 'Play'}>
					<i class="fas {$isPlaying ? 'fa-pause' : 'fa-play'}"></i>
				</button>
				<button class="control-btn" on:click={nextTrack} aria-label="Next track">
					<i class="fas fa-step-forward"></i>
				</button>
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
		gap: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.track-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
		flex: 1;
	}

	.album-cover {
		width: 60px;
		height: 60px;
		border-radius: 8px;
		object-fit: cover;
	}

	.track-details {
		min-width: 0;
		flex: 1;
	}

	.track-name {
		font-weight: 600;
		font-size: 1.1rem;
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
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.1);
	}

	.play-btn {
		background: #1db954;
		color: white;
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

	.play-btn:hover {
		background: #1ed760;
		transform: scale(1.1);
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

		.player-controls {
			width: 100%;
		}
	}
</style>
