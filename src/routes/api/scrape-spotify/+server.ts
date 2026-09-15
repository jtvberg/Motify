import { json } from '@sveltejs/kit';

const TRACK_META_REGEX = /<meta\s+name="music:song"\s+content="https:\/\/open\.spotify\.com\/track\/([0-9A-Za-z]{22})"/g;

function extractTrackIds(html: string): string[] {
	const trackIds = [...html.matchAll(TRACK_META_REGEX)].map(match => match[1]);
	return [...new Set(trackIds)];
}

export const GET = async ({ url }: { url: URL }) => {
	const playlistId = url.searchParams.get('id');

	if (!playlistId) {
		return json({ error: 'Playlist ID is required' }, { status: 400 });
	}

	if (!/^[0-9A-Za-z]{22}$/.test(playlistId)) {
		return json({ error: 'Invalid playlist ID' }, { status: 400 });
	}

	try {
		const response = await fetch(`https://open.spotify.com/playlist/${playlistId}`);

		if (!response.ok) {
			return json({ error: `HTTP error! status: ${response.status}` }, { status: response.status });
		}

		const trackIds = extractTrackIds(await response.text());

		if (trackIds.length > 0) {
			return json({ trackIds, method: 'spotify-meta' });
		}

		return json({ error: 'No tracks found in Spotify playlist page' }, { status: 502 });

	} catch (error) {
		console.error('Error scraping Spotify:', error);
		return json({ error: 'Failed to scrape Spotify playlist' }, { status: 500 });
	}
};
