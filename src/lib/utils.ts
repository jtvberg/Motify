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

export function extractPlaylistIdFromUrl(url: string): string {
	if (!url) return '';

	const match = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]{22})/);
	return match ? match[1] : '';
}

export function isValidSpotifyPlaylistId(id: string): boolean {
	return /^[a-zA-Z0-9]{22}$/.test(id);
}

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

export async function scrapeEveryNoiseTrackIdsWithProxy(playlistId: string): Promise<string[]> {
	const url = `https://everynoise.com/playlistprofile.cgi?id=${playlistId}`;
	const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
	
	try {
		const response = await fetch(proxyUrl);
		
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		
		const html = await response.text();
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

const trackPlayabilityCache = new Map<string, boolean>();

export function isTrackPlayable(track: any): boolean {
	if (!track || !track.id || !track.name) {
		return false;
	}

	const cacheKey = track.id;
	if (trackPlayabilityCache.has(cacheKey)) {
		return trackPlayabilityCache.get(cacheKey)!;
	}
	
	let isPlayable = true;

	if (track.is_playable === false) {
		isPlayable = false;
	} else if (track.restrictions?.reason) {
		isPlayable = false;
	} else if (!track.uri || track.uri === '') {
		isPlayable = false;
	}
	
	trackPlayabilityCache.set(cacheKey, isPlayable);
	
	if (!isPlayable) {
		console.log('Unavailable track detected:', {
			name: track.name,
			is_playable: track.is_playable,
			restrictions: track.restrictions,
			uri: track.uri
		});
	}
	
	return isPlayable;
}

export function clearTrackPlayabilityCache(): void {
	trackPlayabilityCache.clear();
}

export function findNextPlayableTrack(tracks: any[], startIndex: number, direction: 1 | -1 = 1): number {
	if (tracks.length === 0) return -1;
	
	let currentIndex = startIndex;
	let attempts = 0;
	const maxAttempts = tracks.length;
	
	while (attempts < maxAttempts) {
		if (direction === 1) {
			currentIndex = currentIndex < tracks.length - 1 ? currentIndex + 1 : 0;
		} else {
			currentIndex = currentIndex > 0 ? currentIndex - 1 : tracks.length - 1;
		}
		
		if (isTrackPlayable(tracks[currentIndex])) {
			return currentIndex;
		}
		
		attempts++;

		if (currentIndex === startIndex) {
			break;
		}
	}
	
	return -1;
}