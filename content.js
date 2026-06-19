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
  const STATUS_CLICK_UNBLOCK_MS = 1500;

  const VIDEO_SELECTOR_LIST = VIDEO_SELECTORS.join(',');

  let lastPath = window.location.pathname;
  let scrollTimeout;
  let observer;
  let routeSyncTimeout;
  let statusClickUnblockUntil = 0;

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
   * Keep filtering off briefly during an intentional click-through transition.
   */
  function shouldFilterHomeTimeline() {
    return isHomeTimeline() && Date.now() >= statusClickUnblockUntil;
  }

  /**
   * Keep CSS and filtering scoped to the current route.
   */
  function syncRouteState() {
    lastPath = window.location.pathname;

    const routeState = shouldFilterHomeTimeline() ? HOME_ROUTE : DISABLED_ROUTE;

    if (document.documentElement.getAttribute(ROUTE_ATTR) !== routeState) {
      document.documentElement.setAttribute(ROUTE_ATTR, routeState);
    }

    if (routeState === HOME_ROUTE) {
      filterVideoPosts();
    } else {
      clearFilteredTweets();
    }
  }

  /**
   * Check if an element contains video content
   */
  function containsVideo(element) {
    return !!element.querySelector(VIDEO_SELECTOR_LIST);
  }

  /**
   * Find the timeline cell that owns a tweet.
   */
  function getTweetContainer(tweet) {
    return tweet.closest(CELL_SELECTOR) || tweet;
  }

  /**
   * Undo hidden state from this version and stale inline styles from older versions.
   */
  function clearTweetHiddenState(tweet) {
    const elementToShow = getTweetContainer(tweet);

    elementToShow.classList.remove(FILTERED_CLASS);

    if (tweet.dataset.videoFiltered === 'true') {
      elementToShow.style.removeProperty('display');
      tweet.style.removeProperty('display');
    }

    delete tweet.dataset.videoFiltered;
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
    clearTweetHiddenState(tweet);
  }

  /**
   * Clear route-scoped filtering marks when leaving the home timeline.
   */
  function clearFilteredTweets() {
    document.querySelectorAll(`.${FILTERED_CLASS}`).forEach(element => {
      element.classList.remove(FILTERED_CLASS);
    });

    document.querySelectorAll(`${TWEET_SELECTOR}[data-video-filtered]`).forEach(tweet => {
      clearTweetHiddenState(tweet);
    });
  }

  /**
   * Classify and hide/show one tweet.
   */
  function processTweet(tweet) {
    if (containsVideo(tweet)) {
      hideTweet(tweet);
    } else {
      showTweet(tweet);
    }
  }

  /**
   * Process all tweets on the page.
   */
  function filterVideoPosts() {
    if (!shouldFilterHomeTimeline()) return;
    document.querySelectorAll(TWEET_SELECTOR).forEach(processTweet);
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
   * Re-check route state after X updates its SPA location.
   */
  function scheduleRouteSync() {
    clearTimeout(routeSyncTimeout);
    routeSyncTimeout = setTimeout(syncRouteState, 0);
  }

  /**
   * A status click is an intentional click-through, so unblock before X swaps DOM.
   */
  function handleDocumentClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const eventTarget = event.target;
    const target = eventTarget instanceof Element ? eventTarget : eventTarget && eventTarget.parentElement;
    if (!target) return;

    const statusLink = target.closest('a[href*="/status/"]');
    if (!statusLink) return;

    statusClickUnblockUntil = Date.now() + STATUS_CLICK_UNBLOCK_MS;
    document.documentElement.setAttribute(ROUTE_ATTR, DISABLED_ROUTE);
    clearFilteredTweets();
    scheduleRouteSync();
    setTimeout(syncRouteState, STATUS_CLICK_UNBLOCK_MS);
  }

  /**
   * Set up MutationObserver to handle dynamically loaded content
   */
  function setupObserver() {
    if (observer) return observer;

    observer = new MutationObserver((mutations) => {
      checkRouteChange();

      if (!shouldFilterHomeTimeline()) return;

      const tweetsToCheck = new Set();

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const tweetAncestor = node.closest(TWEET_SELECTOR);
          if (tweetAncestor) tweetsToCheck.add(tweetAncestor);
          node.querySelectorAll(TWEET_SELECTOR).forEach(t => tweetsToCheck.add(t));
        }
      }

      tweetsToCheck.forEach(processTweet);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  function setupScrollListener() {
    window.addEventListener('scroll', () => {
      if (!shouldFilterHomeTimeline()) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(filterVideoPosts, 100);
    }, { passive: true });
  }

  function setupNavigationListeners() {
    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', syncRouteState);
    window.addEventListener('hashchange', syncRouteState);

    if ('navigation' in window) {
      window.navigation.addEventListener('navigate', scheduleRouteSync);
      window.navigation.addEventListener('currententrychange', syncRouteState);
      window.navigation.addEventListener('navigatesuccess', syncRouteState);
    }
  }

  function startWhenBodyExists() {
    if (!document.body) {
      requestAnimationFrame(startWhenBodyExists);
      return;
    }

    syncRouteState();
    setupObserver();
    setupScrollListener();
    setupNavigationListeners();
  }

  installFilterStyles();
  syncRouteState();
  startWhenBodyExists();
  setInterval(checkRouteChange, 250);

  console.log('[Twitter Video Filter] Extension loaded');
})();
