// Twitter Video Filter - Hides posts containing video content

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
   * Hide a tweet element and its parent container (which has the border)
   */
  function hideTweet(tweet) {
    if (tweet.dataset.videoFiltered) return;

    // Find the parent cellInnerDiv which contains the border
    const cellWrapper = tweet.closest('[data-testid="cellInnerDiv"]');
    const elementToHide = cellWrapper || tweet;

    elementToHide.style.display = 'none';
    tweet.dataset.videoFiltered = 'true';
    console.log('[Twitter Video Filter] Blocked a video post');
  }

  /**
   * Check if we're on a tweet detail page (not timeline)
   */
  function isOnTweetPage() {
    // URL pattern: twitter.com/username/status/1234567890 or x.com/username/status/1234567890
    return /\/status\/\d+/.test(window.location.pathname);
  }

  /**
   * Process all tweets on the page
   */
  function filterVideoPosts() {
    // Don't filter on tweet detail pages - user intentionally navigated there
    if (isOnTweetPage()) {
      return;
    }

    const tweets = document.querySelectorAll(TWEET_SELECTOR);
    tweets.forEach(tweet => {
      if (containsVideo(tweet)) {
        hideTweet(tweet);
      }
    });
  }

  /**
   * Set up MutationObserver to handle dynamically loaded content
   */
  function setupObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldFilter = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldFilter = true;
          break;
        }
      }

      if (shouldFilter) {
        filterVideoPosts();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  // Initial filter pass
  filterVideoPosts();

  // Set up observer for dynamically loaded tweets
  setupObserver();

  // Also filter on scroll (backup for any missed tweets)
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(filterVideoPosts, 100);
  }, { passive: true });

  console.log('[Twitter Video Filter] Extension loaded');
})();
