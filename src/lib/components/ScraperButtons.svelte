<script lang="ts">
	import { selectedPlaylist, currentTracks, scraperSettings, playlists } from '$lib/stores';
	import { scrapeEveryNoiseTrackIds, extractPlaylistIdFromUrl } from '$lib/utils';
	import { spotifyAPI } from '$lib/spotify';
	import { toastStore } from '$lib/toast';
	
	let isScrapingDW = false;
	let isScrapingRR = false;

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

			const trackUris = newTrackIds.map(id => `spotify:track:${id}`);

			await spotifyAPI.addTracksToPlaylist($selectedPlaylist.id, trackUris);

			const updatedTracks = await spotifyAPI.getPlaylistTracks($selectedPlaylist.id);
			currentTracks.set(updatedTracks);

			const updatedPlaylists = await spotifyAPI.getUserPlaylists();
			playlists.set(updatedPlaylists);

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
		gap: 0.75rem;
	}
	
	.scraper-btn {
		background: #ffffff1a;
		color: #ffffffff;
		border: 1px solid #ffffff33;
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
		background: #ffffff33;
		transform: translateY(-1px);
	}
	
	.scraper-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
	
	.scraper-btn.discover-weekly:hover:not(:disabled) {
		background: #1db95433;
		border-color: #1db954ff;
	}
	
	.scraper-btn.release-radar:hover:not(:disabled) {
		background: #1ed76033;
		border-color: #1ed760ff;
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
