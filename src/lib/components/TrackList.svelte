<script lang="ts">
	import { onMount } from 'svelte';
	import { selectedPlaylist, targetPlaylist, currentTracks, currentTrackIndex, currentTrack, isPlaying, playbackPosition, currentPlaylistSnapshot, isRefreshingPlaylist } from '$lib/stores';
	import { spotifyAPI, getOperationalUri, isTrackRelinked } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import { tokenManager } from '$lib/tokenManager';
	import { formatDuration } from '$lib/utils';
	import { isTrackPlayable, findNextPlayableTrack } from '$lib/utils';
	import type { SpotifyTrack } from '$lib/spotify';

	let tracks: SpotifyTrack[] = [];
	let loading = false;

	$: if ($selectedPlaylist) {
		loadTracks();
	}

	// Helper function to handle API errors gracefully
	async function handleAPIError<T>(apiCall: () => Promise<T>): Promise<T | null> {
		try {
			// Check token before making the call
			const tokenValid = await tokenManager.checkAndRefreshToken();
			if (!tokenValid) {
				console.error('Invalid token, cannot make API call');
				return null;
			}
			
			return await apiCall();
		} catch (error) {
			console.error('API call failed:', error);
			
			// If it's a 401 error, try one more time after token refresh
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

	async function loadTracks() {
		if (!$selectedPlaylist) return;
		
		loading = true;
		// Reset tracks immediately to prevent showing stale data
		tracks = [];
		currentTracks.set([]);
		
		try {
			console.log(`Loading tracks for playlist: ${$selectedPlaylist.name}`);
			
			const [playlist, tracksData] = await Promise.all([
				handleAPIError(() => spotifyAPI.getPlaylist($selectedPlaylist.id)),
				handleAPIError(() => spotifyAPI.getPlaylistTracks($selectedPlaylist.id))
			]);
			
			if (playlist && tracksData) {
				tracks = tracksData;
				currentTracks.set(tracks);
				currentPlaylistSnapshot.set(playlist.snapshot_id);
				console.log(`Successfully loaded ${tracks.length} tracks`);
				
				// Debug: Check for unavailable tracks
				const unavailableTracks = tracks.filter(track => !isTrackPlayable(track));
				if (unavailableTracks.length > 0) {
					console.log(`Found ${unavailableTracks.length} unavailable tracks:`, unavailableTracks.map(t => ({
						name: t.name,
						is_playable: t.is_playable,
						restrictions: t.restrictions,
						uri: t.uri
					})));
				}
			} else {
				console.error('Failed to load playlist data');
				tracks = [];
				currentTracks.set([]);
			}
		} catch (error) {
			console.error('Failed to load tracks:', error);
			tracks = [];
			currentTracks.set([]);
		} finally {
			loading = false;
		}
	}

	async function refreshPlaylist() {
		if (!$selectedPlaylist || $isRefreshingPlaylist) return;
		
		isRefreshingPlaylist.set(true);
		try {
			console.log(`Refreshing playlist: ${$selectedPlaylist.name}`);
			
			const [playlist, tracksData] = await Promise.all([
				handleAPIError(() => spotifyAPI.getPlaylist($selectedPlaylist.id)),
				handleAPIError(() => spotifyAPI.getPlaylistTracks($selectedPlaylist.id))
			]);
			
			if (playlist && tracksData) {
				const oldTrackCount = tracks.length;
				tracks = tracksData;
				currentTracks.set(tracks);
				currentPlaylistSnapshot.set(playlist.snapshot_id);
				
				// Update the current track index if the current track still exists
				if ($currentTrack) {
					const newIndex = tracks.findIndex(t => t.id === $currentTrack.id);
					if (newIndex >= 0 && newIndex !== $currentTrackIndex) {
						currentTrackIndex.set(newIndex);
						console.log(`Updated current track index to ${newIndex}`);
					} else if (newIndex < 0) {
						// Current track was removed from the playlist
						console.log('Current track no longer in playlist');
					}
				}
				
				console.log(`Playlist refreshed: ${oldTrackCount} → ${tracks.length} tracks`);
			} else {
				console.error('Failed to refresh playlist data');
			}
		} catch (error) {
			console.error('Failed to refresh playlist:', error);
		} finally {
			isRefreshingPlaylist.set(false);
		}
	}

	async function playTrack(track: SpotifyTrack) {
		console.log('=== PLAY TRACK START ===');
		console.log('Attempting to play track:', track.name);
		
		// Check if track is playable before attempting to play
		if (!isTrackPlayable(track)) {
			console.log('Track is not playable, skipping:', track.name);
			alert(`This track is not available for playback: ${track.name}`);
			return;
		}
		
		const deviceId = webPlaybackService.getDeviceId();
		console.log('Device ID:', deviceId);
		
		// Find track index for proper playlist navigation
		const trackIndex = tracks.findIndex(t => t.id === track.id);
		console.log(`Track index: ${trackIndex} for track: ${track.name}`);
		
		// Immediately update UI state for better responsiveness, but only for non-web player
		// Let web player state changes handle track updates to avoid flashing
		if (!deviceId) {
			currentTrack.set(track);
		}
		currentTrackIndex.set(trackIndex);
		playbackPosition.set(0); // Reset position to beginning
		isPlaying.set(true); // Optimistically set playing state
		
		let playSuccessful = false;
		let lastError: any = null;
		
		try {
			if (deviceId) {
				console.log('Using web player with device ID:', deviceId);
				await webPlaybackService.play(track.uri);
				playSuccessful = true;
				console.log('✅ Track started successfully via web player');
			} else {
				console.log('Web player not ready, using fallback');
				await spotifyAPI.playTrack(track.uri);
				// For fallback, we need to set the track since there's no state change event
				currentTrack.set(track);
				playSuccessful = true;
				console.log('✅ Track started successfully via fallback');
			}
		} catch (error) {
			lastError = error;
			console.error('❌ Play request failed:', error);
			
			// Revert optimistic state changes
			isPlaying.set(false);
			
			// Wait a moment and check if playback actually started
			console.log('Checking if playback started despite error...');
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			try {
				if (deviceId) {
					const state = await webPlaybackService.getCurrentState();
					if (state && !state.paused && state.track_window?.current_track?.uri === track.uri) {
						console.log('✅ Playback actually started despite API error');
						playSuccessful = true;
						isPlaying.set(true);
					}
				} else {
					// Check via API
					const state = await spotifyAPI.getPlaybackState();
					if (state && state.is_playing && state.item?.uri === track.uri) {
						console.log('✅ Playback actually started despite API error');
						playSuccessful = true;
						isPlaying.set(true);
					}
				}
			} catch (stateError) {
				console.log('Could not check playback state:', stateError);
			}
		}
		
		// Only show error if play was not successful
		if (!playSuccessful && lastError) {
			// Revert all state changes on failure
			currentTrack.set(null);
			currentTrackIndex.set(-1);
			isPlaying.set(false);
			playbackPosition.set(0);
			
			const errorMessage = typeof lastError === 'object' && lastError !== null && 'message' in lastError
				? (lastError as { message: string }).message
				: String(lastError);
			
			console.error('Showing error to user:', errorMessage);
			
			// Check for specific error types and provide better messages
			if (errorMessage.includes('Premium') || errorMessage.includes('403')) {
				alert('Spotify Premium is required for track playback. Please upgrade your Spotify account to Premium to use this feature.');
			} else if (errorMessage.includes('Device not found') || errorMessage.includes('404')) {
				alert('Playback device not found. Please make sure Spotify is open and try again.');
			} else {
				alert(`Failed to play track: ${errorMessage}. Make sure you have Spotify Premium and try again.`);
			}
		}
		
		console.log('=== PLAY TRACK END ===');
	}

	async function togglePlayPause(track: SpotifyTrack) {
		// Check if track is playable before attempting to play
		if (!isTrackPlayable(track)) {
			console.log('Track is not playable, cannot toggle:', track.name);
			return;
		}
		
		const isCurrentTrack = $currentTrack && $currentTrack.id === track.id;
		
		if (isCurrentTrack && $isPlaying) {
			// Track is currently playing, pause it
			try {
				const deviceId = webPlaybackService.getDeviceId();
				if (deviceId) {
					await webPlaybackService.pause();
				} else {
					await spotifyAPI.pausePlayback();
				}
				isPlaying.set(false);
			} catch (error) {
				console.error('Failed to pause track:', error);
			}
		} else if (isCurrentTrack && !$isPlaying) {
			// Track is current but paused, resume it
			try {
				const deviceId = webPlaybackService.getDeviceId();
				if (deviceId) {
					await webPlaybackService.play();
				} else {
					await spotifyAPI.resumePlayback();
				}
				isPlaying.set(true);
			} catch (error) {
				console.error('Failed to resume track:', error);
			}
		} else {
			// Different track, play it
			await playTrack(track);
		}
	}

	async function removeTrack(track: SpotifyTrack) {
		if (!$selectedPlaylist) return;
		
		const isCurrentlyPlaying = $currentTrack && $currentTrack.id === track.id;
		const currentIndex = tracks.findIndex(t => t.id === track.id);
		
		try {
			// Use the operational URI (linked_from.uri if available) for reliable removal
			const operationalUri = getOperationalUri(track);
			const isRelinked = isTrackRelinked(track);
			console.log(`Removing track "${track.name}" - Relinked: ${isRelinked}, Using URI: ${operationalUri}${isRelinked ? ` (original: ${track.uri})` : ''}`);
			await spotifyAPI.removeTrackFromPlaylist($selectedPlaylist.id, operationalUri);
			// Remove from local tracks array
			tracks = tracks.filter(t => t.id !== track.id);
			currentTracks.set(tracks);
			
			// If we removed the currently playing track, play the next playable one
			if (isCurrentlyPlaying && tracks.length > 0) {
				// After removing a track, the track that was "next" now occupies the same index
				// So we want to start searching from the removed track's position (or one before if it was the last track)
				const startSearchIndex = Math.min(currentIndex, tracks.length - 1);
				
				// First check if the track now at the removed position is playable
				if (startSearchIndex >= 0 && isTrackPlayable(tracks[startSearchIndex])) {
					const nextTrack = tracks[startSearchIndex];
					console.log(`Auto-playing track that moved into removed position: ${nextTrack.name}`);
					await playTrack(nextTrack);
				} else {
					// If the track at the removed position isn't playable, search for the next playable one
					const nextPlayableIndex = findNextPlayableTrack(tracks, startSearchIndex, 1);
					
					if (nextPlayableIndex !== -1) {
						const nextTrack = tracks[nextPlayableIndex];
						console.log(`Auto-playing next playable track after removal: ${nextTrack.name}`);
						await playTrack(nextTrack);
					} else {
						console.log('No playable tracks remaining after removal');
						// Stop playback if no playable tracks remain
						currentTrack.set(null);
						currentTrackIndex.set(-1);
						isPlaying.set(false);
					}
				}
			}
		} catch (error) {
			console.error('Failed to remove track:', error);
		}
	}

	async function moveTrack(track: SpotifyTrack) {
		if (!$targetPlaylist || !$selectedPlaylist) return;
		
		const isCurrentlyPlaying = $currentTrack && $currentTrack.id === track.id;
		const currentIndex = tracks.findIndex(t => t.id === track.id);
		
		try {
			// Use the operational URI for both add and remove operations
			const operationalUri = getOperationalUri(track);
			const isRelinked = isTrackRelinked(track);
			console.log(`Moving track "${track.name}" - Relinked: ${isRelinked}, Using URI: ${operationalUri}${isRelinked ? ` (original: ${track.uri})` : ''}`);
			
			// Add to target playlist
			await spotifyAPI.addTrackToPlaylist($targetPlaylist.id, operationalUri);
			// Remove from source playlist
			await spotifyAPI.removeTrackFromPlaylist($selectedPlaylist.id, operationalUri);
			// Remove from local tracks array
			tracks = tracks.filter(t => t.id !== track.id);
			currentTracks.set(tracks);
			
			// If we moved the currently playing track, play the next playable one
			if (isCurrentlyPlaying && tracks.length > 0) {
				// After moving a track, the track that was "next" now occupies the same index
				// So we want to start searching from the moved track's position (or one before if it was the last track)
				const startSearchIndex = Math.min(currentIndex, tracks.length - 1);
				
				// First check if the track now at the moved position is playable
				if (startSearchIndex >= 0 && isTrackPlayable(tracks[startSearchIndex])) {
					const nextTrack = tracks[startSearchIndex];
					console.log(`Auto-playing track that moved into moved position: ${nextTrack.name}`);
					await playTrack(nextTrack);
				} else {
					// If the track at the moved position isn't playable, search for the next playable one
					const nextPlayableIndex = findNextPlayableTrack(tracks, startSearchIndex, 1);
					
					if (nextPlayableIndex !== -1) {
						const nextTrack = tracks[nextPlayableIndex];
						console.log(`Auto-playing next playable track after move: ${nextTrack.name}`);
						await playTrack(nextTrack);
					} else {
						console.log('No playable tracks remaining after move');
						// Stop playback if no playable tracks remain
						currentTrack.set(null);
						currentTrackIndex.set(-1);
						isPlaying.set(false);
					}
				}
			}
		} catch (error) {
			console.error('Failed to move track:', error);
		}
	}
</script>

<div class="track-list-container">
	{#if $selectedPlaylist}
		<div class="playlist-header">
			<img 
				src={$selectedPlaylist.images[0]?.url || ''} 
				alt="Playlist cover"
				class="playlist-cover"
			/>
			<div class="playlist-info">
				<h2>{$selectedPlaylist.name}</h2>
				<p>{$selectedPlaylist.description || 'No description'}</p>
				<span class="track-count">{tracks.length} tracks</span>
			</div>
			<div class="playlist-actions">
				<button 
					class="refresh-btn" 
					on:click={refreshPlaylist}
					disabled={$isRefreshingPlaylist}
					aria-label="Refresh playlist"
					title="Refresh playlist to sync changes from other devices"
				>
					<i class="fas fa-sync-alt" class:spinning={$isRefreshingPlaylist}></i>
					{$isRefreshingPlaylist ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>
		</div>

		{#if loading}
			<div class="loading">
				<i class="fas fa-spinner fa-spin"></i>
				Loading all tracks from playlist...
			</div>
		{:else if tracks.length === 0}
			<div class="empty-state">
				<i class="fas fa-music fa-3x"></i>
				<p>This playlist is empty</p>
			</div>
		{:else}
			<div class="track-list">
				<div class="track-header">
					<span class="track-number">#</span>
					<span class="track-title">Title</span>
					<span class="track-artist">Artist</span>
					<span class="track-album">Album</span>
					<span class="track-duration">Duration</span>
					<span class="track-actions">Actions</span>
				</div>

				{#each tracks as track, index}
					{@const isCurrentTrack = $currentTrack && $currentTrack.id === track.id}
					{@const trackPlayable = isTrackPlayable(track)}
					<div class="track-item" class:current-track={isCurrentTrack} class:unavailable-track={!trackPlayable}>
						<span class="track-number">{index + 1}</span>
						<div class="track-title">
							<img 
								src={track.album.images[2]?.url || track.album.images[0]?.url} 
								alt="Album cover"
								class="track-cover"
								class:grayscale={!trackPlayable}
							/>
							<span class:current-track-title={isCurrentTrack} class:unavailable-title={!trackPlayable}>
								{track.name}
								{#if !trackPlayable}
									<span class="unavailable-badge">Unavailable</span>
								{/if}
							</span>
						</div>
						<span class="track-artist" class:unavailable-text={!trackPlayable}>{track.artists.map(a => a.name).join(', ')}</span>
						<span class="track-album" class:unavailable-text={!trackPlayable}>{track.album.name}</span>
						<span class="track-duration" class:unavailable-text={!trackPlayable}>{formatDuration(track.duration_ms)}</span>
						<div class="track-actions">
							{#if trackPlayable}
								<button 
									class="action-btn play-btn" 
									class:pause-btn={isCurrentTrack && $isPlaying}
									on:click={() => togglePlayPause(track)}
									aria-label={isCurrentTrack && $isPlaying ? 'Pause track' : 'Play track'}
								>
									<i class="fas {isCurrentTrack && $isPlaying ? 'fa-pause' : 'fa-play'}"></i>
								</button>
							{:else}
								<button 
									class="action-btn play-btn disabled"
									disabled
									aria-label="Track unavailable"
									title="This track is not available for playback"
								>
									<i class="fas fa-ban"></i>
								</button>
							{/if}
							<button 
								class="action-btn remove-btn" 
								on:click={() => removeTrack(track)}
								aria-label="Remove from playlist"
							>
								<i class="fas fa-trash"></i>
							</button>
							{#if trackPlayable && $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
								<button 
									class="action-btn move-btn" 
									on:click={() => moveTrack(track)}
									aria-label="Move to target playlist"
								>
									<i class="fas fa-arrow-right"></i>
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="no-playlist">
			<i class="fas fa-list-music fa-3x"></i>
			<p>Select a playlist to view its tracks</p>
		</div>
	{/if}
</div>

<style>

	h2 {
		margin: 0;
	}
	.track-list-container {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		overflow: hidden;
	}

	.playlist-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 2rem;
		background: linear-gradient(135deg, rgba(29, 185, 84, 0.2), rgba(30, 215, 96, 0.1));
	}

	.playlist-cover {
		width: 96px;
		height: 96px;
		border-radius: 8px;
		object-fit: cover;
	}

	.playlist-info {
		flex: 1;
	}

	.playlist-info h2 {
		margin: 0 0 0.5rem 0;
		font-size: 1.8rem;
		font-weight: 700;
	}

	.playlist-info p {
		margin: 0 0 0.5rem 0;
		color: #b3b3b3;
	}

	.track-count {
		color: #1db954;
		font-weight: 600;
	}

	.playlist-actions {
		display: flex;
		gap: 1rem;
	}

	.refresh-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.5rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.refresh-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.3);
		transform: translateY(-1px);
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.loading, .empty-state, .no-playlist {
		text-align: center;
		padding: 3rem;
		color: #b3b3b3;
	}

	.loading i, .empty-state i, .no-playlist i {
		margin-bottom: 1rem;
		color: #1db954;
	}

	.track-list {
		padding: 0;
	}

	.track-header, .track-item {
		display: grid;
		grid-template-columns: 50px 2fr 1.5fr 1.5fr 100px 150px;
		gap: 1rem;
		padding: 1rem 2rem;
		align-items: center;
	}

	.track-header {
		background: rgba(255, 255, 255, 0.05);
		font-weight: 600;
		color: #b3b3b3;
		text-transform: uppercase;
		font-size: 0.85rem;
		letter-spacing: 0.5px;
	}

	.track-item {
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: background-color 0.2s ease;
	}

	.track-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.track-item.current-track {
		background: rgba(29, 185, 84, 0.1);
		border-left: 3px solid #1db954;
	}

	.track-item.current-track:hover {
		background: rgba(29, 185, 84, 0.15);
	}

	.track-item:last-child {
		border-bottom: none;
	}

	.track-number {
		text-align: center;
		color: #b3b3b3;
	}

	.track-title {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
	}

	.track-title span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-weight: 600;
	}

	.current-track-title {
		color: #1db954 !important;
		font-weight: 700;
	}

	.track-cover {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.track-artist, .track-album {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #b3b3b3;
	}

	.track-duration {
		text-align: center;
		color: #b3b3b3;
	}

	.track-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.action-btn {
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
	}

	.play-btn {
		background: #1db954;
		color: white;
	}

	.play-btn:hover {
		background: #1ed760;
		transform: scale(1.1);
	}

	.pause-btn {
		background: #ff9500 !important;
	}

	.pause-btn:hover {
		background: #ffad33 !important;
	}

	.remove-btn {
		background: rgba(255, 69, 58, 0.8);
		color: white;
	}

	.remove-btn:hover {
		background: rgba(255, 69, 58, 1);
		transform: scale(1.1);
	}

	.move-btn {
		background: rgba(0, 122, 255, 0.8);
		color: white;
	}

	.move-btn:hover {
		background: rgba(0, 122, 255, 1);
		transform: scale(1.1);
	}

	/* Unavailable track styles */
	.unavailable-track {
		opacity: 0.5;
		background: rgba(255, 255, 255, 0.02) !important;
	}

	.unavailable-track:hover {
		background: rgba(255, 255, 255, 0.03) !important;
	}

	.unavailable-text {
		color: #666666 !important;
	}

	.unavailable-title {
		color: #666666 !important;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.unavailable-badge {
		background: rgba(255, 69, 58, 0.8);
		color: white;
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.grayscale {
		filter: grayscale(100%);
		opacity: 0.6;
	}

	.action-btn.disabled {
		background: rgba(255, 255, 255, 0.1) !important;
		color: #666666 !important;
		cursor: not-allowed !important;
		opacity: 0.5;
	}

	.action-btn.disabled:hover {
		background: rgba(255, 255, 255, 0.1) !important;
		transform: none !important;
	}

	@media (max-width: 1024px) {
		.track-header, .track-item {
			grid-template-columns: 40px 2fr 1fr 80px 120px;
			gap: 0.5rem;
			padding: 1rem;
		}

		.track-album {
			display: none;
		}
	}

	@media (max-width: 768px) {
		.playlist-header {
			flex-direction: column;
			text-align: center;
			gap: 0rem;
		}

		.playlist-actions {
			margin-top: 1rem;
		}

		.refresh-btn {
			padding: 0.75rem 1.5rem;
			font-size: 1rem;
		}

		.track-header, .track-item {
			grid-template-columns: 1fr 120px;
			gap: 1rem;
			align-items: unset;
		}

		.track-number, .track-artist, .track-duration {
			display: none;
		}

		.track-title {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}
</style>
