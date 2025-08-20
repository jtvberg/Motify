<script lang="ts">
	import { selectedPlaylist, currentTracks, scraperSettings, playlists } from '$lib/stores';
	import { scrapeEveryNoiseTrackIds, extractPlaylistIdFromUrl } from '$lib/utils';
	import { spotifyAPI } from '$lib/spotify';
	import { toastStore } from '$lib/toast';
	
	let isScrapingDW = false;
	let isScrapingRR = false;
	
	// Check if source playlist is selected and URLs are configured
	$: hasSourcePlaylist = $selectedPlaylist !== null;
	$: hasDiscoverWeekly = $scraperSettings.discoverWeeklyUrl.trim() !== '';
	$: hasReleaseRadar = $scraperSettings.releaseRadarUrl.trim() !== '';
	
	async function scrapeAndAddTracks(playlistUrl: string, playlistName: string) {
		if (!$selectedPlaylist) {
			toastStore.add({
				type: 'warning',
				message: 'Please select a source playlist first'
			});
			return;
		}
		
		const playlistId = extractPlaylistIdFromUrl(playlistUrl);
		if (!playlistId) {
			toastStore.add({
				type: 'error',
				message: 'Invalid playlist URL'
			});
			return;
		}
		
		try {
			console.log(`Scraping ${playlistName} (${playlistId})...`);
			const trackIds = await scrapeEveryNoiseTrackIds(playlistId);
			
			if (trackIds.length === 0) {
				toastStore.add({
					type: 'info',
					message: `No tracks found in ${playlistName}`
				});
				return;
			}
			
			console.log(`Found ${trackIds.length} tracks in ${playlistName}`);
			
			// Get current tracks in the source playlist to avoid duplicates
			const currentTrackIds = $currentTracks.map(track => track.id);
			const newTrackIds = trackIds.filter(id => !currentTrackIds.includes(id));
			
			if (newTrackIds.length === 0) {
				toastStore.add({
					type: 'info',
					message: `All tracks from ${playlistName} are already in the source playlist`
				});
				return;
			}
			
			console.log(`Adding ${newTrackIds.length} new tracks to playlist ${$selectedPlaylist.name}`);
			
			// Convert track IDs to URIs
			const trackUris = newTrackIds.map(id => `spotify:track:${id}`);
			
			// Add tracks to the selected playlist
			await spotifyAPI.addTracksToPlaylist($selectedPlaylist.id, trackUris);
			
			// Refresh the current tracks list to update the UI
			const updatedTracks = await spotifyAPI.getPlaylistTracks($selectedPlaylist.id);
			currentTracks.set(updatedTracks);
			
			// Update the playlist in the playlists store to reflect new track count
			const updatedPlaylists = await spotifyAPI.getUserPlaylists();
			playlists.set(updatedPlaylists);
			
			// Update selected playlist with new track count
			const updatedSelectedPlaylist = updatedPlaylists.find(p => p.id === $selectedPlaylist.id);
			if (updatedSelectedPlaylist) {
				selectedPlaylist.set(updatedSelectedPlaylist);
			}
			
			toastStore.add({
				type: 'success',
				message: `Successfully added ${newTrackIds.length} new tracks from ${playlistName} to ${$selectedPlaylist.name}`,
				duration: 6000
			});
			
		} catch (error) {
			console.error(`Error scraping ${playlistName}:`, error);
			toastStore.add({
				type: 'error',
				message: `Failed to scrape ${playlistName}: ${error}`,
				duration: 8000
			});
		}
	}
	
	async function scrapeDiscoverWeekly() {
		isScrapingDW = true;
		try {
			await scrapeAndAddTracks($scraperSettings.discoverWeeklyUrl, 'Discover Weekly');
		} finally {
			isScrapingDW = false;
		}
	}
	
	async function scrapeReleaseRadar() {
		isScrapingRR = true;
		try {
			await scrapeAndAddTracks($scraperSettings.releaseRadarUrl, 'Release Radar');
		} finally {
			isScrapingRR = false;
		}
	}
</script>

<div class="scraper-buttons">
	{#if hasDiscoverWeekly}
		<button 
			class="scraper-btn discover-weekly"
			on:click={scrapeDiscoverWeekly}
			disabled={!hasSourcePlaylist || isScrapingDW}
			title={hasSourcePlaylist ? 'Add Discover Weekly tracks to source playlist' : 'Select a source playlist first'}
		>
			{#if isScrapingDW}
				<i class="fas fa-spinner fa-spin"></i>
			{:else}
				<i class="fas fa-compass"></i>
			{/if}
			<span>DW</span>
		</button>
	{/if}
	
	{#if hasReleaseRadar}
		<button 
			class="scraper-btn release-radar"
			on:click={scrapeReleaseRadar}
			disabled={!hasSourcePlaylist || isScrapingRR}
			title={hasSourcePlaylist ? 'Add Release Radar tracks to source playlist' : 'Select a source playlist first'}
		>
			{#if isScrapingRR}
				<i class="fas fa-spinner fa-spin"></i>
			{:else}
				<i class="fas fa-satellite-dish"></i>
			{/if}
			<span>RR</span>
		</button>
	{/if}
</div>

<style>
	.scraper-buttons {
		display: flex;
		gap: 0.5rem;
	}
	
	.scraper-btn {
		background: rgba(255, 255, 255, 0.1);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 600;
		min-width: 60px;
		height: 34px;
	}
	
	.scraper-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}
	
	.scraper-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
	
	.scraper-btn.discover-weekly:hover:not(:disabled) {
		background: rgba(29, 185, 84, 0.2);
		border-color: #1db954;
	}
	
	.scraper-btn.release-radar:hover:not(:disabled) {
		background: rgba(30, 215, 96, 0.2);
		border-color: #1ed760;
	}
	
	.scraper-btn i {
		font-size: 1rem;
	}
	
	.scraper-btn span {
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.5px;
	}
</style>
