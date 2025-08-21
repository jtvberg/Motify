export function formatDuration(durationMs: number): string {
	const minutes = Math.floor(durationMs / 60000);
	const seconds = Math.floor((durationMs % 60000) / 1000);
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Extracts a Spotify playlist ID from a Spotify URL
 * @param url - The Spotify playlist URL
 * @returns The playlist ID or empty string if not found
 */
export function extractPlaylistIdFromUrl(url: string): string {
	if (!url) return '';

	const match = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]{22})/);
	return match ? match[1] : '';
}

/**
 * Validates if a string is a valid Spotify playlist ID
 * @param id - The playlist ID to validate
 * @returns boolean indicating if the ID is valid
 */
export function isValidSpotifyPlaylistId(id: string): boolean {
	return /^[a-zA-Z0-9]{22}$/.test(id);
}

/**
 * Scrapes track IDs from an everynoise.com playlist profile page using server-side endpoint
 * @param playlistId - The Spotify playlist ID
 * @returns Promise<string[]> - Array of track IDs
 */
export async function scrapeEveryNoiseTrackIds(playlistId: string): Promise<string[]> {
	try {
		const response = await fetch(`/api/scrape-everynoise?id=${encodeURIComponent(playlistId)}`);
		
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		
		const data = await response.json();
		
		if (data.error) {
			throw new Error(data.error);
		}
		
		console.log('Scraped track IDs:', data.trackIds);
		console.log('HTML sample:', data.sampleHtml);
		
		return data.trackIds || [];
		
	} catch (error) {
		console.error('Error scraping everynoise data:', error);
		
		// Provide instructions for manual execution
		const url = `https://everynoise.com/playlistprofile.cgi?id=${playlistId}`;
		console.log('Due to scraping limitations, you may need to run this manually in the browser console:');
		console.log(`1. Go to: ${url}`);
		console.log('2. Wait a couple of seconds for the page to load');
		console.log('3. Run this in the console:');
		console.log(`
let trackList = [];
document.querySelectorAll('.trackrow').forEach(t => trackList.push(t.id));
console.log('Track IDs:', trackList);
		`);
		
		throw error;
	}
}

/**
 * Alternative approach using a CORS proxy
 * @param playlistId - The Spotify playlist ID  
 * @returns Promise<string[]> - Array of track IDs
 */
export async function scrapeEveryNoiseTrackIdsWithProxy(playlistId: string): Promise<string[]> {
	const url = `https://everynoise.com/playlistprofile.cgi?id=${playlistId}`;
	const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
	
	try {
		const response = await fetch(proxyUrl);
		
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		
		const html = await response.text();
		
		// Parse the HTML to extract track IDs
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		
		const trackList: string[] = [];
		const trackRows = doc.querySelectorAll('.trackrow');
		
		trackRows.forEach(t => {
			if (t.id) {
				trackList.push(t.id);
			}
		});
		
		console.log('Scraped track IDs via proxy:', trackList);
		return trackList;
		
	} catch (error) {
		console.error('Error scraping everynoise data via proxy:', error);
		throw error;
	}
}

/**
 * Check if a track is playable
 * @param track - The Spotify track to check
 * @returns boolean indicating if the track is playable
 */
export function isTrackPlayable(track: any): boolean {
	// Debug: Log ALL track data to see what we're getting
	console.log('Track data for:', track.name, {
		is_playable: track.is_playable,
		restrictions: track.restrictions,
		uri: track.uri,
		id: track.id,
		full_track: track
	});
	
	// Debug: Simulate some tracks as unavailable for testing (remove this later)
	// Uncomment the next 3 lines to test with every 5th track being unavailable
	if (track.name && track.name.toLowerCase().includes('test')) {
		console.log('Marking as unavailable due to test keyword:', track.name);
		return false;
	}
	
	// Log track data for debugging (can be removed later)
	if (track && (track.is_playable === false || track.restrictions)) {
		console.log('Unavailable track detected:', {
			name: track.name,
			is_playable: track.is_playable,
			restrictions: track.restrictions,
			uri: track.uri
		});
	}
	
	// If is_playable is explicitly set to false, track is not playable
	if (track.is_playable === false) {
		return false;
	}
	
	// Check for restrictions that would make it unplayable
	if (track.restrictions?.reason) {
		return false;
	}
	
	// Check if the track has a valid URI (some unavailable tracks might have null/empty URIs)
	if (!track.uri || track.uri === '') {
		return false;
	}
	
	// Check if track is null or has missing essential data
	if (!track || !track.id || !track.name) {
		return false;
	}
	
	// If no explicit playability info, assume it's playable
	return true;
}

/**
 * Find the next playable track in a list
 * @param tracks - Array of tracks to search
 * @param startIndex - Index to start searching from
 * @param direction - 1 for forward, -1 for backward
 * @returns The index of the next playable track, or -1 if none found
 */
export function findNextPlayableTrack(tracks: any[], startIndex: number, direction: 1 | -1 = 1): number {
	if (tracks.length === 0) return -1;
	
	let currentIndex = startIndex;
	let attempts = 0;
	const maxAttempts = tracks.length; // Avoid infinite loop
	
	while (attempts < maxAttempts) {
		// Calculate next index with wrapping
		if (direction === 1) {
			currentIndex = currentIndex < tracks.length - 1 ? currentIndex + 1 : 0;
		} else {
			currentIndex = currentIndex > 0 ? currentIndex - 1 : tracks.length - 1;
		}
		
		// Check if this track is playable
		if (isTrackPlayable(tracks[currentIndex])) {
			return currentIndex;
		}
		
		attempts++;
		
		// If we've looped back to the start position, no playable tracks found
		if (currentIndex === startIndex) {
			break;
		}
	}
	
	return -1; // No playable track found
}
