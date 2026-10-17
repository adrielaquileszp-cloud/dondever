// Episode tracking via AniList (free, no key). Shared by the page and the service worker.
// AniList's airingAt is the Japanese TV broadcast time; Crunchyroll simulcasts usually land
// within about an hour of it.
const Anime = (() => {
  const API = 'https://graphql.anilist.co';

  async function gql(query, variables) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error((json.errors && json.errors[0].message) || 'AniList ' + res.status);
    return json.data;
  }

  function crunchyrollLink(media) {
    const link = (media.externalLinks || []).find(l => /crunchyroll/i.test(l.site));
    return link ? link.url : null;
  }

  function displayTitle(media) {
    return media.title.english || media.title.romaji || media.title.native;
  }

  async function search(text) {
    const data = await gql(`
      query ($q: String) {
        Page(perPage: 15) {
          media(search: $q, type: ANIME, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
            id status episodes seasonYear format
            title { romaji english native }
            coverImage { large }
            nextAiringEpisode { episode airingAt }
            externalLinks { site url }
          }
        }
      }`, { q: text });
    return data.Page.media;
  }

  // Latest aired episode + next airing for each followed id.
  async function fetchStatus(ids) {
    const data = await gql(`
      query ($ids: [Int]) {
        aired: Page(perPage: 50) {
          airingSchedules(mediaId_in: $ids, notYetAired: false, sort: TIME_DESC) { mediaId episode airingAt }
        }
        info: Page(perPage: 50) {
          media(id_in: $ids) { id status episodes nextAiringEpisode { episode airingAt } }
        }
      }`, { ids });
    const out = {};
    for (const m of data.info.media) {
      out[m.id] = { status: m.status, episodes: m.episodes, next: m.nextAiringEpisode, lastEp: 0 };
    }
    for (const s of data.aired.airingSchedules) {
      if (out[s.mediaId] && s.episode > out[s.mediaId].lastEp) out[s.mediaId].lastEp = s.episode;
    }
    for (const id in out) {
      const o = out[id];
      if (!o.lastEp && o.next) o.lastEp = o.next.episode - 1;
      if (!o.lastEp && o.status === 'FINISHED' && o.episodes) o.lastEp = o.episodes;
    }
    return out;
  }

  async function getFollowing() {
    return Store.get('anime', []);
  }

  async function follow(media) {
    const list = await getFollowing();
    if (list.some(a => a.id === media.id)) return list;
    const status = (await fetchStatus([media.id]))[media.id] || {};
    list.push({
      id: media.id,
      title: displayTitle(media),
      cover: media.coverImage && media.coverImage.large,
      url: crunchyrollLink(media),
      lastEp: status.lastEp || 0, // start from the current episode so we don't notify old ones
      next: status.next || null,
      status: status.status || media.status,
    });
    await Store.set('anime', list);
    return list;
  }

  async function unfollow(id) {
    const list = (await getFollowing()).filter(a => a.id !== id);
    await Store.set('anime', list);
    return list;
  }

  // Checks every followed anime; calls notify(anime, episode) for each new episode.
  async function check(notify) {
    const list = await getFollowing();
    if (!list.length) return [];
    const status = await fetchStatus(list.map(a => a.id));
    const fresh = [];
    for (const a of list) {
      const s = status[a.id];
      if (!s) continue;
      if (s.lastEp > a.lastEp) {
        fresh.push({ anime: a, episode: s.lastEp });
        a.lastEp = s.lastEp;
      }
      a.next = s.next;
      a.status = s.status;
    }
    await Store.set('anime', list);
    await Store.set('lastCheck', Date.now());
    for (const f of fresh) await notify(f.anime, f.episode);
    return fresh;
  }

  function notificationFor(anime, episode) {
    return {
      title: `Nuevo episodio: ${anime.title}`,
      options: {
        body: `El episodio ${episode} ya salió. En Crunchyroll puede tardar hasta ~1 hora.`,
        icon: anime.cover || 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: `anime-${anime.id}-${episode}`,
        data: { url: anime.url || 'https://www.crunchyroll.com/' },
      },
    };
  }

  return { search, follow, unfollow, getFollowing, check, crunchyrollLink, displayTitle, notificationFor };
})();
