<script lang="ts">
	import { selectedPlaylist, targetPlaylist, currentTracks, currentTrackIndex, currentTrack, isPlaying, playbackPosition, currentPlaylistSnapshot, isRefreshingPlaylist, isPlaylistSelectorOpen } from '$lib/stores';
	import { spotifyAPI } from '$lib/spotify';
	import { webPlaybackService } from '$lib/webPlayback';
	import { tokenManager } from '$lib/tokenManager';
	import { 
		formatDuration, 
		isTrackPlayable,
		clearTrackPlayabilityCache,
		togglePlayPause,
		removeTrack,
		moveTrack
	} from '$lib/utils';
	import { toastStore } from '$lib/toast';
	import type { SpotifyTrack } from '$lib/spotify';

	let tracks: SpotifyTrack[] = [];
	let loading = false;

	$: tracks = $currentTracks;

	const dummyTrackDuration = {
		set: () => {},
		subscribe: () => () => {},
		update: () => {}
	};

	const stores = {
		isPlaying,
		currentTrack,
		currentTracks,
		currentTrackIndex,
		playbackPosition,
		trackDuration: dummyTrackDuration,
		selectedPlaylist,
		targetPlaylist
	};

	const services = {
		spotifyAPI,
		webPlaybackService,
		toastStore
	};

	$: if ($selectedPlaylist) {
		loadTracks();
	}

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

	async function loadTracks() {
		if (!$selectedPlaylist) return;
		
		loading = true;
		tracks = [];
		currentTracks.set([]);
		
		try {
			console.log(`Loading tracks for playlist: ${$selectedPlaylist.name}`);
			
			const tracksData = await handleAPIError(() => spotifyAPI.getPlaylistTracks($selectedPlaylist.id));
			
			if (tracksData) {
				tracks = tracksData;
				currentTracks.set(tracks);
				currentPlaylistSnapshot.set($selectedPlaylist.snapshot_id);
				console.log(`Successfully loaded ${tracks.length} tracks`);

				const unavailableTracks = tracks.filter(track => !isTrackPlayable(track));
				if (unavailableTracks.length > 0) {
					console.log(`Found ${unavailableTracks.length} unavailable tracks out of ${tracks.length} total`);
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

				clearTrackPlayabilityCache();

				if ($currentTrack) {
					const newIndex = tracks.findIndex(t => t.id === $currentTrack.id);
					if (newIndex >= 0 && newIndex !== $currentTrackIndex) {
						currentTrackIndex.set(newIndex);
					} else if (newIndex < 0) {
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

	async function togglePlayPauseHandler(track: SpotifyTrack) {
		await togglePlayPause(track, tracks, stores, services);
	}

	async function removeTrackHandler(track: SpotifyTrack) {
		await removeTrack(track, tracks, stores, services, handleAPIError);
	}

	async function moveTrackHandler(track: SpotifyTrack) {
		await moveTrack(track, tracks, stores, services, handleAPIError);
	}

	function openPlaylistSelector() {
		isPlaylistSelectorOpen.set(true);
	}
</script>

<div class="track-list-container">
	{#if $selectedPlaylist}
		<div class="playlist-header">
			<div class="playlist-info-container">
				<div class="playlist-selected-info">
					{#if $selectedPlaylist.images?.[0]?.url}
						<img 
							src={$selectedPlaylist.images[0].url} 
							alt="Playlist cover"
							class="playlist-cover"
						/>
					{:else}
						<div class="playlist-cover playlist-cover-default">
							<i class="fas fa-music"></i>
						</div>
					{/if}
					<div class="playlist-info">
						<h2 title="{$selectedPlaylist.name}">{$selectedPlaylist.name}</h2>
						<p title="{$selectedPlaylist.description || 'No description'}">{$selectedPlaylist.description || 'No description'}</p>
						<span class="track-count">{tracks.length} tracks</span>
					</div>
				</div>
				<div class="playlist-separator fa fa-angles-right"></div>
				<div class="playlist-target-info">
					{#if $targetPlaylist && $targetPlaylist.images?.[0]?.url}
						<img 
							src={$targetPlaylist.images[0].url} 
							alt="Playlist cover"
							class="playlist-cover"
						/>
					{:else}
						<div class="playlist-cover playlist-cover-default">
							<i class="fas fa-music"></i>
						</div>
					{/if}
					<div class="playlist-info playlist-info-right">
						<h2>{$targetPlaylist ? $targetPlaylist.name : ''}</h2>
						<p>{$targetPlaylist ? ($targetPlaylist.description || 'No description') : ''}</p>
					</div>
				</div>
			</div>
			<div class="playlist-actions">
				<button
					class="playlist-selector-btn"
					on:click={openPlaylistSelector}
					aria-label="Change playlists"
					title="Change selected playlists"
				>
					<i class="fas fa-list"></i>
				</button>
				<button 
					class="refresh-btn" 
					on:click={refreshPlaylist}
					disabled={$isRefreshingPlaylist}
					aria-label="Refresh playlist"
					title="Refresh source playlist"
				>
					<i class="fas fa-sync-alt" class:spinning={$isRefreshingPlaylist}></i>
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
						<span class="track-number">
						{#if isCurrentTrack}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_interactive_supports_focus -->
							<div 
								class="action-btn fas {isCurrentTrack && $isPlaying ? 'fa-pause' : 'fa-play'}" 
								on:click={() => togglePlayPauseHandler(track)}
								aria-label={isCurrentTrack && $isPlaying ? 'Pause track' : 'Play track'}
								role="button"
							>
							</div>
						{:else}
							{#if trackPlayable}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_interactive_supports_focus -->
								<div 
									class="track-number-btn"
									on:click={() => togglePlayPauseHandler(track)}
									aria-label="Play track"
									role="button"
									>
									<span class="track-number-index">{index + 1}</span>
									<i class="track-number-icon fas fa-play"></i>
								</div>
							{:else}
								<div 
									class="action-btn play-btn fas fa-ban disabled"
									aria-label="Track unavailable"
									title="This track is not available for playback"
								>
								</div>
							{/if}
						{/if}
						</span>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<div 
							class="track-title"
							class:not-playable={!trackPlayable}
   							on:click={() => trackPlayable && togglePlayPauseHandler(track)}
							aria-label="Play track"
							role="button"
						>
							{#if track.album.images[2]?.url || track.album.images[0]?.url}
								<img 
									src={track.album.images[2]?.url || track.album.images[0]?.url} 
									alt="Album cover"
									class="track-cover"
									class:grayscale={!trackPlayable}
								/>
							{:else}
								<div class="track-cover track-cover-default" class:grayscale={!trackPlayable}>
									<i class="fas fa-compact-disc"></i>
								</div>
							{/if}
							<span class="track-name" class:current-track-title={isCurrentTrack} class:unavailable-title={!trackPlayable}>
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
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_interactive_supports_focus -->
							<div 
								class="action-btn remove-btn far fa-trash-can fa-xl" 
								on:click={() => removeTrackHandler(track)}
								aria-label="Remove from playlist"
								role="button"
							>
							</div>
							{#if trackPlayable && $targetPlaylist && $targetPlaylist.id !== $selectedPlaylist?.id}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_interactive_supports_focus -->
								<div 
									class="action-btn move-btn far fa-square-plus fa-xl" 
									on:click={() => moveTrackHandler(track)}
									aria-label="Move to target playlist"
									role="button"
								>
								</div>
							{:else}
								<div 
									class="action-btn move-btn far fa-square-plus fa-xl action-btn-disabled" 
									aria-label="Move to target playlist"
									title={$targetPlaylist ? 'Select a different target playlist to enable moving tracks' : 'Select a target playlist to enable moving tracks'}
								>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<div class="no-playlist">
			<i class="no-playlist-icon fas fa-music fa-3x"></i>
			<button class="playlist-selector-btn" on:click={openPlaylistSelector}>
				<i class="fas fa-list"></i>
				Choose Playlists
			</button>
		</div>
	{/if}
</div>

<style>
	h2 {
		margin: 0;
	}

	.track-list-container {
		background: #ffffff04;
		backdrop-filter: blur(10px);
		border-radius: 12px;
		border: 1px solid #1e1e1eff;
		overflow: hidden;
	}

	.playlist-header {
    	display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		background: linear-gradient(135deg, #061a0d33, #1ed7601a);
	}

	.playlist-info-container {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    	justify-content: space-around;
	}

	.playlist-selected-info, .playlist-target-info {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.playlist-target-info {
		align-items: flex-end;
	}

	.playlist-separator {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 142px;
		color: #b3b3b3ff;
		font-size: clamp(2rem, 6vw, 60px);
	}

	.playlist-cover {
		width: 142px;
		height: 142px;
		border-radius: 8px;
		object-fit: cover;
	}

	.playlist-cover-default {
		background: #ffffff1a;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #ffffff33;
	}

	.playlist-cover-default i {
		font-size: 2.5rem;
		color: #ffffffb3;
	}

	.playlist-info {
    	flex: 1;
    	display: flex;
		flex-direction: column;
		justify-content: flex-start;
		line-height: 1;
		gap: .5rem;
	}

	.playlist-info h2 {
		margin: 0;
		font-size: 1.8rem;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-bottom: 2px;
	}

	.playlist-info p {
		margin: 0;
		color: #b3b3b3ff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding-bottom: 2px;
	}

	.playlist-info-right {
		align-items: flex-end;
		text-align: right;
	}

	.track-count {
		color: #1db954ff;
		font-weight: 600;
	}

	.playlist-actions {
		display: flex;
		justify-content: center;
		gap: 1rem;
	}

	.refresh-btn, .playlist-selector-btn {
		background: #ffffff1a;
		color: #ffffffff;
		border: 1px solid #ffffff33;
		padding: 0.75rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		font-size: 1rem;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500;
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.no-playlist-icon {
		margin-bottom: 1rem;
		color: #1db954ff;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
	}

	.loading {
		display: flex;
		color: #f3f3f3ff;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		gap: 0.5rem;
	}

	.loading i {
		color: #1db954ff;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.no-playlist {
		padding: 3rem;
		color: #b3b3b3ff;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.track-list {
		padding: 0;
		line-height: 1;
	}

	.not-playable {
		cursor: not-allowed !important;
		pointer-events: none;
	}

	.track-header, .track-item {
		display: grid;
		grid-template-columns: 50px 2fr 1.5fr 1.5fr 100px 150px;
		gap: 1rem;
		padding: 1rem 2rem;
		align-items: center;
	}

	.track-header {
		background: #ffffff0d;
		font-weight: 600;
		color: #b3b3b3ff;
		text-transform: uppercase;
		font-size: 0.85rem;
		letter-spacing: 0.5px;
	}

	.track-item {
		border-bottom: 1px solid #1e1e1eff;
		transition: background-color 0.2s ease;
		content-visibility: auto;
	}

	.track-item.current-track {
		background: #1db9541a;
		box-shadow: inset 3px 0px 0px 0px #1db954ff;
	}

	.track-item:last-child {
		border-bottom: none;
	}

	.track-number {
		display: flex;
		justify-content: center;
		color: #b3b3b3ff;
	}

	.track-number-icon {
		display: none;
	}

	.track-title {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-width: 0;
		cursor: pointer;
	}

	.current-track-title {
		color: #1db954ff !important;
		font-weight: 700;
	}

	.track-cover {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.track-cover-default {
		background: #ffffff1a;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #ffffff33;
	}

	.track-cover-default i {
		font-size: 1.2rem;
		color: #ffffffb3;
	}

	.track-name, .track-artist, .track-album {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: #b3b3b3ff;
		padding-bottom: 1px;
	}

	.track-name {
		font-weight: 600;
		color: #f3f3f3ff;
		padding-right: 16px;
	}

	.track-duration {
		text-align: center;
		color: #b3b3b3ff;
	}

	.track-actions {
		display: flex;
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

	.action-btn-disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.play-btn {
		background: #1db954ff;
		color: #f3f3f3ff;
	}

	.remove-btn {
		color: #b3b3b3ff;
	}

	.move-btn {
		color: #b3b3b3ff;
	}

	/* Unavailable track styles */
	.unavailable-track {
		opacity: 0.5;
		background: #ffffff05 !important;
	}

	.unavailable-text {
		color: #666666ff !important;
	}

	.unavailable-title {
		color: #666666ff !important;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.unavailable-badge {
		background: #ff453acc;
		color: #f3f3f3ff;
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
		background: #ffffff1a !important;
		color: #666666ff !important;
		cursor: not-allowed !important;
		opacity: 0.5;
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
		.refresh-btn, .playlist-selector-btn {
			background: #ffffff1a;
			color: #ffffffff;
			border: 1px solid #ffffff33;
			padding: 0.75rem;
			border-radius: 8px;
			cursor: pointer;
			transition: all 0.3s ease;
			display: flex;
			font-size: 1rem;
			align-items: center;
			gap: 0.5rem;
			font-weight: 500;
		}

		.track-header, .track-item {
			grid-template-columns: 1fr 120px;
			gap: 1rem;
			align-items: unset;
		}

		.track-number, .track-artist, .track-duration {
			display: none;
		}

		.track-cover {
			width: 64px;
			height: 64px;
		}

		.track-title {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.track-name {
			width: calc(100vw - 24px)
		}

		.track-actions {
			justify-content: flex-end;
			align-items: center;
		}

		.action-btn {
			width: 64px;
			height: 64px;
			font-size: 2rem;
		}
	}

	@media (hover: hover) {
		.action-btn-disabled:hover {
			color: gray !important;
			transform: none !important;
		}

		.unavailable-track:hover {
			background: #ffffff08 !important;
		}

		.move-btn:hover {
			color: #007affcc;
			transform: scale(1.1);
		}

		.remove-btn:hover {
			color: #ff453aff;
			transform: scale(1.1);
		}

		.play-btn:hover {
			background: #1ed760ff;
			transform: scale(1.1);
		}

		.track-number-btn:hover .track-number-index {
			display: none;
		}

		.track-number-btn:hover .track-number-icon {
			display: inline;
		}

		.track-number-btn:hover {
			cursor: pointer;
		}

		.track-item.current-track:hover {
			background: #1db95426;
		}

		.track-item:hover {
			background: #ffffff0d;
		}

		.refresh-btn:hover:not(:disabled), .playlist-selector-btn:hover {
			background: #ffffff33;
			border-color: #ffffff4d;
			transform: translateY(-1px);
		}
	}

</style>
