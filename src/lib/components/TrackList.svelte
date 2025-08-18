<script lang="ts">
	import { onMount } from 'svelte';
	import { selectedPlaylist, targetPlaylist, currentTracks, currentTrackIndex, currentTrack } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import { formatDuration } from '$lib/utils';
	import type { SpotifyTrack } from '$lib/spotify';

	let tracks: SpotifyTrack[] = [];
	let loading = false;

	$: if ($selectedPlaylist) {
		loadTracks();
	}

	async function loadTracks() {
		if (!$selectedPlaylist) return;
		
		loading = true;
		try {
			const tracksData = await spotifyAPI.getPlaylistTracks($selectedPlaylist.id);
			tracks = tracksData;
			currentTracks.set(tracks);
		} catch (error) {
			console.error('Failed to load tracks:', error);
		} finally {
			loading = false;
		}
	}

	async function playTrack(track: SpotifyTrack) {
		console.log('=== PLAY TRACK START ===');
		console.log('Attempting to play track:', track.name);
		
		const deviceId = webPlaybackService.getDeviceId();
		console.log('Device ID:', deviceId);
		
		// Find track index for proper playlist navigation
		const trackIndex = tracks.findIndex(t => t.id === track.id);
		console.log(`Track index: ${trackIndex} for track: ${track.name}`);
		
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
				playSuccessful = true;
				console.log('✅ Track started successfully via fallback');
			}
			
			// Only update stores after successful playback start
			if (playSuccessful) {
				currentTrackIndex.set(trackIndex);
				console.log(`Updated current track index to ${trackIndex}`);
			}
		} catch (error) {
			lastError = error;
			console.error('❌ Play request failed:', error);
			
			// If playback failed immediately, revert the store changes
			currentTrack.set(null);
			currentTrackIndex.set(-1);
			
			// Wait a moment and check if playback actually started
			console.log('Checking if playback started despite error...');
			await new Promise(resolve => setTimeout(resolve, 500));
			
			try {
				const state = await webPlaybackService.getCurrentState();
				if (state && !state.paused && state.track_window?.current_track?.uri === track.uri) {
					console.log('✅ Playback actually started despite API error');
					playSuccessful = true;
					// Restore the store values
					currentTrack.set(track);
					currentTrackIndex.set(trackIndex);
				}
			} catch (stateError) {
				console.log('Could not check playback state:', stateError);
			}
		}
		
		// Only show error if play was not successful
		if (!playSuccessful && lastError) {
			const errorMessage = typeof lastError === 'object' && lastError !== null && 'message' in lastError
				? (lastError as { message: string }).message
				: String(lastError);
			console.error('Showing error to user:', errorMessage);
			alert(`Failed to play track: ${errorMessage}. Make sure you have Spotify Premium and try again.`);
		}
		
		console.log('=== PLAY TRACK END ===');
	}

	async function removeTrack(track: SpotifyTrack) {
		if (!$selectedPlaylist) return;
		
		try {
			await spotifyAPI.removeTrackFromPlaylist($selectedPlaylist.id, track.uri);
			// Remove from local tracks array
			tracks = tracks.filter(t => t.id !== track.id);
			currentTracks.set(tracks);
		} catch (error) {
			console.error('Failed to remove track:', error);
		}
	}

	async function moveTrack(track: SpotifyTrack) {
		if (!$targetPlaylist || !$selectedPlaylist) return;
		
		try {
			// Add to target playlist
			await spotifyAPI.addTrackToPlaylist($targetPlaylist.id, track.uri);
			// Remove from source playlist
			await spotifyAPI.removeTrackFromPlaylist($selectedPlaylist.id, track.uri);
			// Remove from local tracks array
			tracks = tracks.filter(t => t.id !== track.id);
			currentTracks.set(tracks);
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
		</div>

		{#if loading}
			<div class="loading">
				<i class="fas fa-spinner fa-spin"></i>
				Loading tracks...
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
					<div class="track-item">
						<span class="track-number">{index + 1}</span>
						<div class="track-title">
							<img 
								src={track.album.images[2]?.url || track.album.images[0]?.url} 
								alt="Album cover"
								class="track-cover"
							/>
							<span>{track.name}</span>
						</div>
						<span class="track-artist">{track.artists.map(a => a.name).join(', ')}</span>
						<span class="track-album">{track.album.name}</span>
						<span class="track-duration">{formatDuration(track.duration_ms)}</span>
						<div class="track-actions">
							<button 
								class="action-btn play-btn" 
								on:click={() => playTrack(track)}
								aria-label="Play track"
							>
								<i class="fas fa-play"></i>
							</button>
							<button 
								class="action-btn remove-btn" 
								on:click={() => removeTrack(track)}
								aria-label="Remove from playlist"
							>
								<i class="fas fa-trash"></i>
							</button>
							{#if $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
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
		width: 80px;
		height: 80px;
		border-radius: 8px;
		object-fit: cover;
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
		font-size: 0.9rem;
	}

	.play-btn {
		background: #1db954;
		color: white;
	}

	.play-btn:hover {
		background: #1ed760;
		transform: scale(1.1);
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
		}

		.track-header, .track-item {
			grid-template-columns: 1fr 100px;
			gap: 1rem;
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
