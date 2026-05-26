// Twitter Video Filter - Hides video posts on the home timeline

(function() {
  'use strict';

  // Selectors for identifying video content within tweets
  const VIDEO_SELECTORS = [
    'video',
    '[data-testid="videoPlayer"]',
    '[data-testid="videoComponent"]',
    '[data-testid="playButton"]',
    '[aria-label*="Embedded video"]',
    '[data-testid="card.wrapper"] video',
    '[data-testid="tweetPhoto"] video'
  ];

  // Selector for tweet articles
  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const CELL_SELECTOR = '[data-testid="cellInnerDiv"]';
  const FILTERED_CLASS = 'twitter-video-filter-hidden';
  const ROUTE_ATTR = 'data-twitter-video-filter-route';
  const HOME_ROUTE = 'home';
  const DISABLED_ROUTE = 'off';
  const STYLE_ID = 'twitter-video-filter-styles';

  let lastPath = window.location.pathname;
  let filterScheduled = false;
  let scrollTimeout;
  let observer;

  /**
   * Install route-scoped CSS before tweets render to reduce visible reflow.
   */
  function installFilterStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;

    const cssHasSelectors = VIDEO_SELECTORS
      .map(selector =>
        `html[${ROUTE_ATTR}="${HOME_ROUTE}"] ${CELL_SELECTOR}:has(${TWEET_SELECTOR} ${selector})`
      )
      .join(',\n');

    style.textContent = `
html[${ROUTE_ATTR}="${HOME_ROUTE}"] .${FILTERED_CLASS} {
  display: none !important;
}

@supports selector(:has(*)) {
${cssHasSelectors} {
  display: none !important;
}
}
`;

    (document.head || document.documentElement).appendChild(style);
  }

  /**
   * Check if we're on the home timeline.
   */
  function isHomeTimeline() {
    return /^\/home\/?$/.test(window.location.pathname);
  }

  /**
   * Keep CSS and filtering scoped to the current route.
   */
  function syncRouteState() {
    lastPath = window.location.pathname;

    const routeState = isHomeTimeline() ? HOME_ROUTE : DISABLED_ROUTE;

    if (document.documentElement.getAttribute(ROUTE_ATTR) !== routeState) {
      document.documentElement.setAttribute(ROUTE_ATTR, routeState);
    }

    if (routeState === HOME_ROUTE) {
      scheduleFilterVideoPosts();
    } else {
      clearFilteredTweets();
    }
  }

  /**
   * Check if an element contains video content
   */
  function containsVideo(element) {
    for (const selector of VIDEO_SELECTORS) {
      if (element.querySelector(selector)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find the timeline cell that owns a tweet.
   */
  function getTweetContainer(tweet) {
    return tweet.closest(CELL_SELECTOR) || tweet;
  }

  /**
   * Mark a tweet as filtered. CSS only hides it on the home timeline.
   */
  function hideTweet(tweet) {
    const elementToHide = getTweetContainer(tweet);
    if (elementToHide.classList.contains(FILTERED_CLASS)) return;

    elementToHide.classList.add(FILTERED_CLASS);
    tweet.dataset.videoFiltered = 'true';
    console.log('[Twitter Video Filter] Blocked a video post');
  }

  /**
   * Remove a stale filtered mark from a tweet/container.
   */
  function showTweet(tweet) {
    getTweetContainer(tweet).classList.remove(FILTERED_CLASS);
    delete tweet.dataset.videoFiltered;
  }

  /**
   * Clear route-scoped filtering marks when leaving the home timeline.
   */
  function clearFilteredTweets() {
    document.querySelectorAll(`.${FILTERED_CLASS}`).forEach(element => {
      element.classList.remove(FILTERED_CLASS);
    });

    document.querySelectorAll(`${TWEET_SELECTOR}[data-video-filtered]`).forEach(tweet => {
      delete tweet.dataset.videoFiltered;
    });
  }

  /**
   * Process all tweets on the page.
   */
  function filterVideoPosts() {
    if (!isHomeTimeline()) return;

    const tweets = document.querySelectorAll(TWEET_SELECTOR);
    tweets.forEach(tweet => {
      if (containsVideo(tweet)) {
        hideTweet(tweet);
      } else {
        showTweet(tweet);
      }
    });
  }

  /**
   * Batch filtering work so one render burst causes one scan.
   */
  function scheduleFilterVideoPosts() {
    if (filterScheduled) return;

    filterScheduled = true;
    requestAnimationFrame(() => {
      filterScheduled = false;
      filterVideoPosts();
    });
  }

  /**
   * Detect SPA route changes, including browser/site back navigation.
   */
  function checkRouteChange() {
    if (window.location.pathname === lastPath) return;

    lastPath = window.location.pathname;
    syncRouteState();
  }

  /**
   * Set up MutationObserver to handle dynamically loaded content
   */
  function setupObserver() {
    if (observer) return observer;

    observer = new MutationObserver((mutations) => {
      checkRouteChange();

      if (!isHomeTimeline()) return;

      let shouldFilter = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldFilter = true;
          break;
        }
      }

      if (shouldFilter) {
        scheduleFilterVideoPosts();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  function setupScrollListener() {
    window.addEventListener('scroll', () => {
      if (!isHomeTimeline()) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(scheduleFilterVideoPosts, 100);
    }, { passive: true });
  }

  function startWhenBodyExists() {
    if (!document.body) {
      requestAnimationFrame(startWhenBodyExists);
      return;
    }

    syncRouteState();
    setupObserver();
    setupScrollListener();
  }

  installFilterStyles();
  syncRouteState();
  startWhenBodyExists();
  window.addEventListener('popstate', syncRouteState);
  setInterval(checkRouteChange, 250);

  console.log('[Twitter Video Filter] Extension loaded');
})();
