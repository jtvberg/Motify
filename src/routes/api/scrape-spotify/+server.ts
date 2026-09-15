import { json } from '@sveltejs/kit';

const CRAWLER_USER_AGENTS = [
	'facebookexternalhit/1.1',
	'Googlebot/2.1 (+http://www.google.com/bot.html)'
];

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

	const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`;
	let lastStatus = 0;

	try {
		for (const userAgent of CRAWLER_USER_AGENTS) {
			const response = await fetch(spotifyUrl, {
				headers: { 'User-Agent': userAgent }
			});

			if (!response.ok) {
				lastStatus = response.status;
				console.log(`Spotify page request failed with ${userAgent}:`, response.status);
				continue;
			}

			const trackIds = extractTrackIds(await response.text());

			if (trackIds.length > 0) {
				return json({ trackIds, method: 'spotify-meta' });
			}

			console.log(`No music:song meta tags found with ${userAgent}`);
		}

		if (lastStatus) {
			return json({ error: `HTTP error! status: ${lastStatus}` }, { status: lastStatus });
		}

		return json({ error: 'No tracks found in Spotify playlist page' }, { status: 502 });

	} catch (error) {
		console.error('Error scraping Spotify:', error);
		return json({ error: 'Failed to scrape Spotify playlist' }, { status: 500 });
	}
};
