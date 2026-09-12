// ========== IPTV Video Player ==========
// Global Variables
let hls;
let currentXtreamConfig = null;

// Login Screen Elements
const loginScreen = document.getElementById("loginScreen");
const mainApp = document.getElementById("mainApp");
const methodBtns = document.querySelectorAll(".method-btn");
const xtreamForm = document.getElementById("xtreamForm");
const fileForm = document.getElementById("fileForm");
const urlForm = document.getElementById("urlForm");
const serverCodeInput = document.getElementById("serverCodeInput");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const rememberMe = document.getElementById("rememberMe");
const connectBtn = document.getElementById("connectBtn");
const connectionStatus = document.getElementById("connectionStatus");
const fileStatus = document.getElementById("fileStatus");
const urlStatus = document.getElementById("urlStatus");
const m3uFileLogin = document.getElementById("m3uFileLogin");
const m3uUrlInput = document.getElementById("m3uUrlInput");
const rememberUrl = document.getElementById("rememberUrl");
const loadUrlBtn = document.getElementById("loadUrlBtn");
const savedCredentials = document.getElementById("savedCredentials");
const useSavedBtn = document.getElementById("useSavedBtn");
const clearSavedBtn = document.getElementById("clearSavedBtn");
const logoutBtn = document.getElementById("logoutBtn");
const toggleFavoritesBtn = document.getElementById("toggleFavoritesBtn");

// Main App Elements
const video = document.getElementById("videoPlayer");
const spinner = document.getElementById("spinner");
const channelsContainer = document.getElementById("channelsContainer");
const moviesContainer = document.getElementById("moviesContainer");
const currentChannelDisplay = document.getElementById("currentChannel");
const channelCountDisplay = document.getElementById("channelCount");
const searchBox = document.getElementById("searchBox");
const categorySearchBox = document.getElementById("categorySearchBox");
const tabSwitcher = document.getElementById("tabSwitcher");
const sidebarTitle = document.getElementById("sidebarTitle");
const tabBtns = document.querySelectorAll(".tab-btn");

// Tab state
let currentTab = "iptv";
let allMovies = [];
let categorizedMovies = {};
let allMovieCategories = [];
let xtreamCategories = [];
let categoryIdMap = {};

// Controls
const playPauseBtn = document.getElementById("playPauseBtn");
const stopBtn = document.getElementById("stopBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeSlider = document.getElementById("volumeSlider");
const volumeTooltip = document.getElementById("volumeTooltip");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const subtitleBtn = document.getElementById("subtitleBtn");
const subtitleMenu = document.getElementById("subtitleMenu");
const progressBar = document.getElementById("progressBar");
const progressFilled = document.getElementById("progressFilled");
const currentTimeDisplay = document.getElementById("currentTime");
const durationDisplay = document.getElementById("duration");

// Data
let channels = [];
let allChannels = [];
let currentSelectedIndex = -1;
let favoriteChannelIds = [];
let showOnlyFavorites = false;
let categorizedChannels = {};
let selectedCategories = [];
let allCategories = [];
let showCategoryHeaders = true;
let currentSubtitles = [];

// ========== Encryption & Cookie Functions ==========
const COOKIE_NAME = "iptv_credentials";
const FAVORITES_COOKIE = "iptv_favorites";
const CATEGORIES_COOKIE = "iptv_categories";
const M3U_URL_COOKIE = "iptv_m3u_url";
// NOTE: This key is used for basic obfuscation of saved credentials in local storage.
// It is NOT a secure encryption for server-side transmission.
const ENCRYPTION_KEY = "IPTV_SECURE_KEY_2026";

function simpleEncrypt(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length));
  }
  return btoa(result);
}

function simpleDecrypt(encoded) {
  try {
    const text = atob(encoded);
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length));
    }
    return result;
  } catch (e) {
    return null;
  }
}

function saveCredentialsToCookie(host, username, password) {
  const data = JSON.stringify({ host, username, password });
  const encrypted = simpleEncrypt(data);
  try {
    localStorage.setItem(COOKIE_NAME, encrypted);
  } catch (e) {
    console.error("Failed to save credentials:", e);
  }
}

function loadCredentialsFromCookie() {
  try {
    const encrypted = localStorage.getItem(COOKIE_NAME);
    if (encrypted) {
      const decrypted = simpleDecrypt(encrypted);
      if (decrypted) {
        try {
          return JSON.parse(decrypted);
        } catch (e) {
          return null;
        }
      }
    }
  } catch (e) {
    console.error("Failed to load credentials:", e);
  }
  return null;
}

function clearCredentialsCookie() {
  try {
    localStorage.removeItem(COOKIE_NAME);
  } catch (e) {
    console.error("Failed to clear credentials:", e);
  }
}

// ========== Favorites Management ==========
function saveFavoritesToCookie(favorites) {
  try {
    localStorage.setItem(FAVORITES_COOKIE, JSON.stringify(favorites));
  } catch (e) {
    console.error("Failed to save favorites:", e);
  }
}

function loadFavoritesFromCookie() {
  try {
    const data = localStorage.getItem(FAVORITES_COOKIE);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load favorites:", e);
  }
  return [];
}

function toggleFavorite(channelId) {
  const index = favoriteChannelIds.indexOf(channelId);
  if (index > -1) {
    favoriteChannelIds.splice(index, 1);
  } else {
    favoriteChannelIds.push(channelId);
  }
  saveFavoritesToCookie(favoriteChannelIds);
  updateFavoritesButton();
}

function isFavorite(channelId) {
  return favoriteChannelIds.indexOf(channelId) > -1;
}

function updateFavoritesButton() {
  if (favoriteChannelIds.length > 0) {
    toggleFavoritesBtn.style.display = "block";
    const btnText = document.getElementById("favBtnText");
    btnText.textContent = showOnlyFavorites ? "Show All" : "Show Favorites (" + favoriteChannelIds.length + ")";
  } else {
    toggleFavoritesBtn.style.display = "none";
    showOnlyFavorites = false;
  }
}

// ========== Categories Management ==========
function saveSelectedCategoriesToCookie(categories) {
  try {
    localStorage.setItem(CATEGORIES_COOKIE, JSON.stringify(categories));
  } catch (e) {
    console.error("Failed to save categories:", e);
  }
}

function loadSelectedCategoriesFromCookie() {
  try {
    const data = localStorage.getItem(CATEGORIES_COOKIE);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load categories:", e);
  }
  return [];
}

// ========== M3U URL Management ==========
function saveM3uUrlToCookie(url) {
  const encrypted = simpleEncrypt(url);
  try {
    localStorage.setItem(M3U_URL_COOKIE, encrypted);
  } catch (e) {
    console.error("Failed to save M3U URL:", e);
  }
}

function loadM3uUrlFromCookie() {
  try {
    const encrypted = localStorage.getItem(M3U_URL_COOKIE);
    if (encrypted) {
      return simpleDecrypt(encrypted);
    }
  } catch (e) {
    console.error("Failed to load M3U URL:", e);
  }
  return null;
}

function clearM3uUrlCookie() {
  try {
    localStorage.removeItem(M3U_URL_COOKIE);
  } catch (e) {
    console.error("Failed to clear M3U URL:", e);
  }
}

function parseChannelsIntoCategories(channelsList) {
  const categories = {};
  let currentCategory = "Uncategorized";
  
  channelsList.forEach(function(channel) {
    if (channel.name.includes("#####")) {
      currentCategory = channel.name.replace(/#/g, '').trim();
      if (!categories[currentCategory]) {
        categories[currentCategory] = [];
      }
    } else {
      if (!categories[currentCategory]) {
        categories[currentCategory] = [];
      }
      categories[currentCategory].push(channel);
    }
  });
  
  Object.keys(categories).forEach(function(key) {
    if (categories[key].length === 0) {
      delete categories[key];
    }
  });
  
  return categories;
}

function isCategoryVisible(categoryName) {
  if (selectedCategories.length === 0) return true;
  return selectedCategories.indexOf(categoryName) > -1;
}

// ========== Xtream Codes API Functions ==========
function normalizeServerUrl(url) {
  url = url.trim();
  // Remove trailing slash
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  // Add http:// if no protocol is specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
}

async function testXtreamConnection(host, username, password) {
  showSpinner(true);
  showStatus(connectionStatus, "Testing connection...", "info");
  
  try {
    const normalizedHost = normalizeServerUrl(host);
    const apiUrl = normalizedHost + "/player_api.php?username=" + username + "&password=" + password;
    const proxyFetchUrl = PROXY_URL + '?target=' + encodeURIComponent(apiUrl);
    const response = await fetch(proxyFetchUrl);
    if (!response.ok) {
      throw new Error("HTTP Error: " + response.status);
    }
    
    const data = await response.json();
    
    if (data.user_info && data.user_info.username) {
      showStatus(connectionStatus, "Connection successful!", "success");
      showSpinner(false);
      return { host: normalizedHost, username, password };
    } else {
      throw new Error("Invalid credentials");
    }
  } catch (error) {
    console.error("Connection test failed:", error);
    showStatus(connectionStatus, "Connection failed: " + error.message, "error");
    showSpinner(false);
    return null;
  }
}

async function loadXtreamChannels(config) {
  const host = config.host;
  const username = config.username;
  const password = config.password;
  showSpinner(true);
  
  const apiUrl = host + "/player_api.php?username=" + username + "&password=" + password + "&action=get_live_streams";
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data && Array.isArray(data)) {
      const parsedChannels = data.map(function(channel) {
        return {
          id: "xtream_" + channel.stream_id,
          name: channel.name,
          url: host + "/live/" + username + "/" + password + "/" + channel.stream_id + ".m3u8",
          icon: channel.stream_icon || null,
          isLive: channel.stream_type === "live",
          categoryId: channel.category_id
        };
      });
      
      allChannels = parsedChannels;
      categorizedChannels = parseChannelsIntoCategories(allChannels);
      allCategories = Object.keys(categorizedChannels);
      
      if (selectedCategories.length === 0) {
        const polishCategories = allCategories.filter(function(cat) {
          return cat.toUpperCase().startsWith("PL -") || cat.toUpperCase().startsWith("PL-");
        });
        if (polishCategories.length > 0) {
          selectedCategories = polishCategories;
          saveSelectedCategoriesToCookie(selectedCategories);
        }
      }
      
      renderChannelsByCategory();
      searchBox.style.display = "block";
      categorySearchBox.style.display = "block";
      updateFavoritesButton();
      
      const manageCategoriesBtn = document.getElementById("manageCategoriesBtn");
      const toggleCategoryHeadersBtn = document.getElementById("toggleCategoryHeadersBtn");
      if (allCategories.length > 0) {
        manageCategoriesBtn.style.display = "block";
        if (toggleCategoryHeadersBtn) {
          toggleCategoryHeadersBtn.style.display = "block";
        }
      }
      
      showSpinner(false);
      console.log("Loaded " + parsedChannels.length + " channels in " + allCategories.length + " categories");
      return true;
    } else {
      throw new Error("Invalid response from API");
    }
  } catch (error) {
    console.error("Error loading Xtream channels:", error);
    showStatus(connectionStatus, "Failed to load channels", "error");
    showSpinner(false);
    return false;
  }
}

async function loadXtreamCategories(config) {
  const host = config.host;
  const username = config.username;
  const password = config.password;
  
  const apiUrl = host + "/player_api.php?username=" + username + "&password=" + password + "&action=get_live_categories";
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data && Array.isArray(data)) {
      return data;
    } else {
      return [];
    }
  } catch (error) {
    console.error("Error loading categories:", error);
    return [];
  }
}

async function loadXtreamChannelsByCategories(config, categoryIds) {
  const host = config.host;
  const username = config.username;
  const password = config.password;
  
  showSpinner(true);
  
  try {
    let allChannelsData = [];
    
    // Fetch channels for each selected category
    for (let i = 0; i < categoryIds.length; i++) {
      const categoryId = categoryIds[i];
      const apiUrl = host + "/player_api.php?username=" + username + "&password=" + password + "&action=get_live_streams&category_id=" + categoryId;
      
      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (data && Array.isArray(data)) {
          allChannelsData = allChannelsData.concat(data);
        }
      } catch (error) {
        console.error("Error loading category " + categoryId + ":", error);
      }
    }
    
    if (allChannelsData.length > 0) {
      const parsedChannels = allChannelsData.map(function(channel) {
        return {
          id: "xtream_" + channel.stream_id,
          name: channel.name,
          url: host + "/live/" + username + "/" + password + "/" + channel.stream_id + ".m3u8",
          icon: channel.stream_icon || null,
          isLive: channel.stream_type === "live",
          categoryId: channel.category_id
        };
      });
      
      allChannels = parsedChannels;
      categorizedChannels = parseChannelsIntoCategories(allChannels);
      allCategories = Object.keys(categorizedChannels);
      
      if (selectedCategories.length === 0) {
        const polishCategories = allCategories.filter(function(cat) {
          return cat.toUpperCase().startsWith("PL -") || cat.toUpperCase().startsWith("PL-");
        });
        if (polishCategories.length > 0) {
          selectedCategories = polishCategories;
          saveSelectedCategoriesToCookie(selectedCategories);
        }
      }
      
      renderChannelsByCategory();
      searchBox.style.display = "block";
      categorySearchBox.style.display = "block";
      updateFavoritesButton();
      
      const manageCategoriesBtn = document.getElementById("manageCategoriesBtn");
      const toggleCategoryHeadersBtn = document.getElementById("toggleCategoryHeadersBtn");
      if (allCategories.length > 0) {
        manageCategoriesBtn.style.display = "block";
        if (toggleCategoryHeadersBtn) {
          toggleCategoryHeadersBtn.style.display = "block";
        }
      }
      
      showSpinner(false);
      console.log("Loaded " + parsedChannels.length + " channels in " + allCategories.length + " categories");
      return true;
    } else {
      throw new Error("Invalid response from API");
    }
  } catch (error) {
    console.error("Error loading Xtream channels:", error);
    showStatus(connectionStatus, "Failed to load channels", "error");
    showSpinner(false);
    return false;
  }
}

async function loadXtreamMovies(config) {
  const host = config.host;
  const username = config.username;
  const password = config.password;
  showSpinner(true);
  
  const apiUrl = host + "/player_api.php?username=" + username + "&password=" + password + "&action=get_vod_streams";
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data && Array.isArray(data)) {
      const parsedMovies = data.map(function(movie) {
        return {
          id: "vod_" + movie.stream_id,
          name: movie.name,
          url: host + "/movie/" + username + "/" + password + "/" + movie.container_extension,
          streamId: movie.stream_id,
          containerExtension: movie.container_extension,
          icon: movie.stream_icon || movie.cover || null,
          year: movie.year || "",
          rating: movie.rating || ""
        };
      });
      
      allMovies = parsedMovies;
      categorizedMovies = parseMoviesIntoCategories(allMovies);
      allMovieCategories = Object.keys(categorizedMovies);
      
      showSpinner(false);
      console.log("Loaded " + parsedMovies.length + " movies in " + allMovieCategories.length + " categories");
      return true;
    } else {
      throw new Error("Invalid response from API");
    }
  } catch (error) {
    console.error("Error loading movies:", error);
    showSpinner(false);
    return false;
  }
}

function parseMoviesIntoCategories(movies) {
  const categorized = { "All Movies": [] };
  
  movies.forEach(function(movie) {
    categorized["All Movies"].push(movie);
  });
  
  return categorized;
}

// ========== Utility Functions ==========
function showSpinner(show) {
  spinner.style.display = show ? "flex" : "none";
}

function showMainApp(showTabs) {
  loginScreen.style.display = "none";
  mainApp.style.display = "flex";
  const headerControls = document.getElementById("headerControls");
  if (headerControls) {
    headerControls.style.display = "flex";
  }
  if (tabSwitcher && showTabs) {
    tabSwitcher.style.display = "flex";
  }
}

function showStatus(element, message, type) {
  element.textContent = message;
  element.className = "status-message show " + type;
  setTimeout(function() {
    element.classList.remove("show");
  }, 4000);
}

function formatTime(seconds) {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins.toString().padStart(2, '0') + ":" + secs.toString().padStart(2, '0');
}

function updateChannelCount() {
  const channelText = "Channels loaded: " + channels.length;
  channelCountDisplay.textContent = channelText;
}

// ========== Channel Rendering Functions ==========
function renderChannels(channelsList) {
  channelsContainer.innerHTML = "";
  channels = [];
  currentSelectedIndex = -1;
  
  let filteredChannels = channelsList;
  if (showOnlyFavorites && favoriteChannelIds.length > 0) {
    filteredChannels = channelsList.filter(function(ch) {
      return isFavorite(ch.id);
    });
  }
  
  if (filteredChannels.length === 0) {
    const noChannelsText = showOnlyFavorites ? 
      '<div class="no-channels"><p>No favorite channels</p><p class="hint">Star channels to add them to favorites</p></div>' :
      '<div class="no-channels"><p>No channels found</p></div>';
    channelsContainer.innerHTML = noChannelsText;
    updateChannelCount();
    return;
  }
  
  filteredChannels.forEach(function(ch, index) {
    const channelDiv = createChannelElement(ch, index);
    channelsContainer.appendChild(channelDiv);
    channels.push(channelDiv);
  });
  
  updateChannelCount();
}

function renderChannelsByCategory() {
  channelsContainer.innerHTML = "";
  channels = [];
  currentSelectedIndex = -1;
  
  let totalChannels = 0;
  
  if (!showCategoryHeaders) {
    const allChannelsList = [];
    Object.keys(categorizedChannels).forEach(function(categoryName) {
      const categoryChannels = categorizedChannels[categoryName];
      if (!isCategoryVisible(categoryName)) return;
      
      let displayChannels = categoryChannels;
      if (showOnlyFavorites && favoriteChannelIds.length > 0) {
        displayChannels = categoryChannels.filter(function(ch) {
          return isFavorite(ch.id);
        });
      }
      
      allChannelsList.push.apply(allChannelsList, displayChannels);
    });
    
    allChannelsList.forEach(function(ch, index) {
      const channelDiv = createChannelElement(ch, index);
      channelsContainer.appendChild(channelDiv);
      channels.push(channelDiv);
      totalChannels++;
    });
    
    if (totalChannels === 0) {
      const noChannelsText = showOnlyFavorites ? 
        '<div class="no-channels"><p>No channels found</p><p class="hint">No favorite channels in selected categories</p></div>' :
        '<div class="no-channels"><p>📺 No channels to display</p><p class="hint">Open "Manage Categories" to select categories</p></div>';
      channelsContainer.innerHTML = noChannelsText;
    }
  } else {
    Object.keys(categorizedChannels).forEach(function(categoryName) {
      const categoryChannels = categorizedChannels[categoryName];
      
      if (!isCategoryVisible(categoryName)) return;
      
      let displayChannels = categoryChannels;
      if (showOnlyFavorites && favoriteChannelIds.length > 0) {
        displayChannels = categoryChannels.filter(function(ch) {
          return isFavorite(ch.id);
        });
      }
      
      if (displayChannels.length === 0) return;
      
      const categoryHeader = document.createElement("div");
      categoryHeader.className = "category-header";
      categoryHeader.dataset.category = categoryName;
      
      const categoryNameDiv = document.createElement("div");
      categoryNameDiv.className = "category-name";
      categoryNameDiv.innerHTML = '<span class="category-icon">▼</span><span>' + categoryName + '</span>';
      
      const categoryCount = document.createElement("span");
      categoryCount.className = "category-count";
      categoryCount.textContent = displayChannels.length + " channels";
      
      categoryHeader.appendChild(categoryNameDiv);
      categoryHeader.appendChild(categoryCount);
      
      const channelsDiv = document.createElement("div");
      channelsDiv.className = "category-channels";
      channelsDiv.dataset.category = categoryName;
      
      displayChannels.forEach(function(ch, index) {
        const channelDiv = createChannelElement(ch, index);
        channelsDiv.appendChild(channelDiv);
        channels.push(channelDiv);
        totalChannels++;
      });
      
      categoryHeader.addEventListener("click", function() {
        categoryHeader.classList.toggle("collapsed");
        channelsDiv.classList.toggle("collapsed");
      });
      
      channelsContainer.appendChild(categoryHeader);
      channelsContainer.appendChild(channelsDiv);
    });
    
    if (totalChannels === 0) {
      const noChannelsText = showOnlyFavorites ? 
        '<div class="no-channels"><p>No channels found</p><p class="hint">No favorite channels in selected categories</p></div>' :
        '<div class="no-channels"><p>📺 No channels to display</p><p class="hint">Open "Manage Categories" to select categories</p></div>';
      channelsContainer.innerHTML = noChannelsText;
    }
  }
  
  channelCountDisplay.textContent = "Channels loaded: " + totalChannels;
}

function createChannelElement(ch, index) {
  const channelDiv = document.createElement("div");
  channelDiv.className = "channel";
  if (isFavorite(ch.id)) {
    channelDiv.classList.add("favorite");
  }
  channelDiv.dataset.index = index;
  channelDiv.dataset.channelId = ch.id;
  
  const iconDiv = document.createElement("div");
  if (ch.icon) {
    const img = document.createElement("img");
    img.dataset.src = ch.icon;
    img.className = "channel-icon";
    img.alt = ch.name;
    img.loading = "lazy";
    img.onerror = function() {
      this.parentElement.innerHTML = '<div class="channel-icon no-icon">�</div>';
    };
    
    // Lazy load images using Intersection Observer
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: "100px" });
    
    observer.observe(img);
    iconDiv.appendChild(img);
  } else {
    iconDiv.innerHTML = '<div class="channel-icon no-icon">🔴</div>';
  }
  
  const infoDiv = document.createElement("div");
  infoDiv.className = "channel-info";
  
  const nameSpan = document.createElement("span");
  nameSpan.className = "channel-name";
  nameSpan.textContent = ch.name;
  
  infoDiv.appendChild(nameSpan);
  
  if (ch.isLive) {
    const liveBadge = document.createElement("span");
    liveBadge.className = "live-badge";
    liveBadge.textContent = "LIVE";
    infoDiv.appendChild(liveBadge);
  }
  
  const favBtn = document.createElement("button");
  favBtn.className = "favorite-btn";
  favBtn.innerHTML = isFavorite(ch.id) ? "⭐" : "☆";
  if (isFavorite(ch.id)) {
    favBtn.classList.add("active");
  }
  favBtn.onclick = function(e) {
    e.stopPropagation();
    toggleFavorite(ch.id);
    favBtn.innerHTML = isFavorite(ch.id) ? "⭐" : "☆";
    favBtn.classList.toggle("active");
    channelDiv.classList.toggle("favorite");
  };
  
  channelDiv.appendChild(iconDiv);
  channelDiv.appendChild(infoDiv);
  channelDiv.appendChild(favBtn);
  
  channelDiv.addEventListener("click", function() {
    playChannel(ch.url, ch.name);
    currentSelectedIndex = channels.indexOf(channelDiv);
    updateSelection();
  });
  
  return channelDiv;
}

function updateSelection() {
  channels.forEach(function(ch) {
    ch.classList.remove("selected");
  });
  if (currentSelectedIndex >= 0 && currentSelectedIndex < channels.length) {
    channels[currentSelectedIndex].classList.add("selected");
    channels[currentSelectedIndex].scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function renderMovies(moviesList, maxResults) {
  moviesContainer.innerHTML = "";
  
  if (!moviesList || moviesList.length === 0) {
    if (allMovies.length === 0) {
      moviesContainer.innerHTML = '<div class="no-channels"><p>🎬 No movies loaded</p></div>';
      channelCountDisplay.textContent = "0 movies";
    } else {
      moviesContainer.innerHTML = '<div class="no-channels"><p>🔍 Search for movies</p><p class="hint">Press Enter after typing to search (max 10 results)</p></div>';
      channelCountDisplay.textContent = allMovies.length + " movies available";
    }
    return;
  }
  
  const limit = maxResults || 10;
  const moviesToRender = moviesList.slice(0, limit);
  
  moviesToRender.forEach(function(movie) {
    const movieDiv = createMovieElement(movie);
    moviesContainer.appendChild(movieDiv);
  });
  
  const totalCount = moviesList.length;
  const displayedCount = moviesToRender.length;
  
  if (totalCount > displayedCount) {
    channelCountDisplay.textContent = "Showing " + displayedCount + " of " + totalCount + " movies";
  } else {
    channelCountDisplay.textContent = displayedCount + " movie" + (displayedCount !== 1 ? 's' : '');
  }
}

function createMovieElement(movie) {
  const movieDiv = document.createElement("div");
  movieDiv.className = "movie";
  movieDiv.dataset.movieId = movie.id;
  
  const posterDiv = document.createElement("div");
  if (movie.icon) {
    const img = document.createElement("img");
    img.dataset.src = movie.icon;
    img.className = "movie-poster";
    img.alt = movie.name;
    img.loading = "lazy";
    img.onerror = function() {
      this.parentElement.innerHTML = '<div class="movie-poster no-poster">🎬</div>';
    };
    
    // Lazy load images using Intersection Observer
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: "100px" });
    
    observer.observe(img);
    posterDiv.appendChild(img);
  } else {
    posterDiv.innerHTML = '<div class="movie-poster no-poster">🎬</div>';
  }
  
  const infoDiv = document.createElement("div");
  infoDiv.className = "movie-info";
  
  const nameDiv = document.createElement("div");
  nameDiv.className = "movie-name";
  nameDiv.textContent = movie.name;
  
  infoDiv.appendChild(nameDiv);
  
  if (movie.year) {
    const yearDiv = document.createElement("div");
    yearDiv.className = "movie-year";
    yearDiv.textContent = movie.year;
    infoDiv.appendChild(yearDiv);
  }
  
  movieDiv.appendChild(posterDiv);
  movieDiv.appendChild(infoDiv);
  
  movieDiv.addEventListener("click", function() {
    playMovie(movie);
    document.querySelectorAll(".movie").forEach(function(m) {
      m.classList.remove("selected");
    });
    movieDiv.classList.add("selected");
  });
  
  return movieDiv;
}

async function fetchMovieInfo(streamId) {
  if (!currentXtreamConfig) return null;
  
  const host = currentXtreamConfig.host;
  const username = currentXtreamConfig.username;
  const password = currentXtreamConfig.password;
  
  const apiUrl = host + "/player_api.php?username=" + username + "&password=" + password + "&action=get_vod_info&vod_id=" + streamId;
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    console.log("Full API response for movie info:", JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error("Error fetching movie info:", error);
    return null;
  }
}

function loadSubtitles(subtitles) {
  currentSubtitles = subtitles || [];
  
  console.log("loadSubtitles called with:", currentSubtitles);
  
  // Clear existing subtitle tracks
  const existingTracks = video.querySelectorAll("track");
  existingTracks.forEach(function(track) {
    video.removeChild(track);
  });
  
  // Clear subtitle menu and add "Off" option
  subtitleMenu.innerHTML = '';
  const offOption = document.createElement("div");
  offOption.className = "subtitle-option active";
  offOption.textContent = "Off";
  offOption.dataset.track = "off";
  offOption.addEventListener("click", function() {
    selectSubtitle("off");
  });
  subtitleMenu.appendChild(offOption);
  
  if (currentSubtitles.length === 0) {
    subtitleBtn.style.display = "none";
    subtitleBtn.classList.remove("active");
    console.log("No subtitles to load, hiding subtitle button");
    return;
  }
  
  subtitleBtn.style.display = "block";
  console.log("Showing subtitle button, loading " + currentSubtitles.length + " tracks");
  
  // Add subtitle tracks to video element
  currentSubtitles.forEach(function(sub, index) {
    console.log("Adding subtitle track " + index + ":", sub);
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = sub.language || "Subtitle " + (index + 1);
    track.srclang = sub.language_code || "en";
    track.src = sub.path || sub.url;
    track.id = "subtitle-track-" + index;
    
    // Add error handler for track loading
    track.addEventListener("error", function(e) {
      console.error("Error loading subtitle track " + index + ":", track.src, e);
    });
    
    track.addEventListener("load", function() {
      console.log("✅ Subtitle track " + index + " loaded successfully:", track.label);
    });
    
    if (index === 0) {
      track.default = false;
    }
    
    video.appendChild(track);
    
    // Add to menu
    const option = document.createElement("div");
    option.className = "subtitle-option";
    option.textContent = sub.language || "Subtitle " + (index + 1);
    option.dataset.track = index;
    
    option.addEventListener("click", function() {
      selectSubtitle(index);
    });
    
    subtitleMenu.appendChild(option);
  });
  
  console.log("Added " + video.textTracks.length + " text tracks to video element");
}

function selectSubtitle(trackIndex) {
  const tracks = video.textTracks;
  
  console.log("selectSubtitle called with index:", trackIndex);
  console.log("Available text tracks:", tracks.length);
  
  // Disable all tracks
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = "disabled";
  }
  
  // Update menu
  const options = subtitleMenu.querySelectorAll(".subtitle-option");
  options.forEach(function(opt) {
    opt.classList.remove("active");
  });
  
  if (trackIndex === "off" || trackIndex < 0) {
    console.log("Disabling all subtitles");
    options[0].classList.add("active");
    subtitleBtn.classList.remove("active");
  } else {
    if (tracks[trackIndex]) {
      tracks[trackIndex].mode = "showing";
      console.log("✅ Enabled subtitle track " + trackIndex + ":", tracks[trackIndex].label);
    } else {
      console.error("❌ Track index " + trackIndex + " not found!");
    }
    options[parseInt(trackIndex) + 1].classList.add("active");
    subtitleBtn.classList.add("active");
  }
  
  subtitleMenu.classList.remove("show");
}

function detectEmbeddedSubtitles() {
  const tracks = video.textTracks;
  console.log("🔍 Checking for embedded subtitles... Found " + tracks.length + " text tracks");
  
  if (tracks.length === 0) {
    console.log("No embedded subtitle tracks detected");
    return;
  }
  
  // Build subtitle list from detected tracks
  const detectedSubtitles = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    if (track.kind === "subtitles" || track.kind === "captions") {
      console.log("📝 Found embedded track " + i + ":", {
        label: track.label,
        language: track.language,
        kind: track.kind
      });
      
      detectedSubtitles.push({
        language: track.label || track.language || "Track " + (i + 1),
        language_code: track.language || "en",
        trackIndex: i
      });
    }
  }
  
  if (detectedSubtitles.length > 0) {
    console.log("✅ Detected " + detectedSubtitles.length + " embedded subtitle tracks");
    updateSubtitleMenuWithEmbedded(detectedSubtitles);
  } else {
    console.log("⚠️ No subtitle or caption tracks found in " + tracks.length + " total tracks");
  }
}

function checkForEmbeddedSubtitlesRepeatedly() {
  let attempts = 0;
  const maxAttempts = 10;
  
  const checkInterval = setInterval(function() {
    attempts++;
    console.log("Subtitle check attempt " + attempts + "/" + maxAttempts);
    
    const tracks = video.textTracks;
    if (tracks.length > 0) {
      console.log("🎯 Found " + tracks.length + " tracks on attempt " + attempts);
      detectEmbeddedSubtitles();
      clearInterval(checkInterval);
    } else if (attempts >= maxAttempts) {
      console.log("❌ No embedded subtitles found after " + maxAttempts + " attempts");
      clearInterval(checkInterval);
    }
  }, 500);
}

function updateSubtitleMenuWithEmbedded(embeddedSubs) {
  if (embeddedSubs.length === 0) return;
  
  // Clear subtitle menu and add "Off" option
  subtitleMenu.innerHTML = '';
  const offOption = document.createElement("div");
  offOption.className = "subtitle-option active";
  offOption.textContent = "Off";
  offOption.dataset.track = "off";
  offOption.addEventListener("click", function() {
    selectSubtitle("off");
  });
  subtitleMenu.appendChild(offOption);
  
  subtitleBtn.style.display = "block";
  
  // Add embedded subtitle options to menu
  embeddedSubs.forEach(function(sub, index) {
    const option = document.createElement("div");
    option.className = "subtitle-option";
    option.textContent = sub.language;
    option.dataset.track = sub.trackIndex;
    
    option.addEventListener("click", function() {
      selectSubtitle(sub.trackIndex);
    });
    
    subtitleMenu.appendChild(option);
  });
  
  console.log("✅ Subtitle menu updated with " + embeddedSubs.length + " embedded tracks");
}

function playMovie(movie) {
  if (!currentXtreamConfig) return;
  
  const host = currentXtreamConfig.host;
  const username = currentXtreamConfig.username;
  const password = currentXtreamConfig.password;
  
  // Try HLS version if MKV (better subtitle support)
  let movieUrl = host + "/movie/" + username + "/" + password + "/" + movie.streamId + "." + movie.containerExtension;
  
  // For MKV files, try HLS version which may have embedded subtitles extracted
  if (movie.containerExtension === "mkv" && movie.name.includes("[MULTI-SUB]")) {
    console.log("🔄 Movie has [MULTI-SUB] tag, trying HLS version for subtitle support");
    movieUrl = host + "/movie/" + username + "/" + password + "/" + movie.streamId + ".m3u8";
  }
  
  currentChannelDisplay.textContent = "🎬 " + movie.name;
  
  showSpinner(true);
  
  // Fetch movie info including subtitles
  fetchMovieInfo(movie.streamId).then(function(info) {
    console.log("Movie info:", info);
    if (info) {
      const subtitleList = [];
      
      // Helper function to process subtitle objects
      function processSubtitle(sub) {
        if (!sub) return null;
        
        // Handle subtitle as string (direct URL)
        if (typeof sub === 'string') {
          return {
            language: "Unknown",
            language_code: "en",
            path: sub,
            url: sub
          };
        }
        
        // Handle subtitle as object
        const subUrl = sub.path || sub.url || sub.subtitle_url || sub.file;
        if (subUrl) {
          return {
            language: sub.language || sub.name || sub.lang || "Unknown",
            language_code: sub.language_code || sub.lang_code || sub.code || "en",
            path: subUrl,
            url: subUrl
          };
        }
        return null;
      }
      
      // Check all possible subtitle locations in Xtream API response
      const possibleLocations = [
        info.info && info.info.subtitles,
        info.movie_data && info.movie_data.subtitles,
        info.subtitles,
        info.info && info.info.subtitle,
        info.movie_data && info.movie_data.subtitle
      ];
      
      possibleLocations.forEach(function(subData) {
        if (!subData) return;
        
        // Handle array of subtitles
        if (Array.isArray(subData)) {
          subData.forEach(function(sub) {
            const processed = processSubtitle(sub);
            if (processed) subtitleList.push(processed);
          });
        }
        // Handle object with subtitle properties
        else if (typeof subData === 'object') {
          // Check if it's a subtitle object itself
          const processed = processSubtitle(subData);
          if (processed) {
            subtitleList.push(processed);
          } else {
            // Maybe it's an object with language keys
            Object.keys(subData).forEach(function(key) {
              const sub = subData[key];
              const processed = processSubtitle(sub);
              if (processed) {
                if (processed.language === "Unknown") {
                  processed.language = key;
                }
                subtitleList.push(processed);
              }
            });
          }
        }
        // Handle single subtitle URL as string
        else if (typeof subData === 'string') {
          const processed = processSubtitle(subData);
          if (processed) subtitleList.push(processed);
        }
      });
      
      if (subtitleList.length > 0) {
        console.log("✅ Found " + subtitleList.length + " subtitles:", subtitleList);
      } else {
        console.log("❌ No subtitles in API response. [MULTI-SUB] movies have embedded subtitles that cannot be accessed via web browser.");
      }
      
      loadSubtitles(subtitleList);
    } else {
      console.log("No movie info returned from API");
      loadSubtitles([]);
    }
  }).catch(function(error) {
    console.error("Error loading subtitles:", error);
    loadSubtitles([]);
  });
  
  if (hls) {
    hls.destroy();
  }
  
  video.pause();
  video.src = "";
  
  setTimeout(function() {
    if (Hls.isSupported() && (movie.containerExtension === "m3u8" || movieUrl.indexOf(".m3u8") > -1)) {
      hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 60,
        enableWorker: true,
        subtitleDisplay: true,
        xhrSetup: function(xhr, url) {
            xhr.open('GET', PROXY_URL + '?target=' + encodeURIComponent(url), true);
        }
      });
      hls.loadSource(movieUrl);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, function() {
        video.play().then(function() {
          showSpinner(false);
          // Check for embedded subtitles after manifest is parsed
          checkForEmbeddedSubtitlesRepeatedly();
        }).catch(function(error) {
          console.error("Playback error:", error);
          showSpinner(false);
        });
      });
      
      hls.on(Hls.Events.ERROR, function(event, data) {
        if (data.fatal) {
          console.error("HLS fatal error:", data);
          showSpinner(false);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = PROXY_URL + '?target=' + encodeURIComponent(movieUrl);
      video.addEventListener('loadeddata', function onLoaded() {
        showSpinner(false);
        video.removeEventListener('loadeddata', onLoaded);
        // Check for embedded subtitles
        checkForEmbeddedSubtitlesRepeatedly();
      });
      video.play().catch(function(error) {
        console.error("Playback error:", error);
        showSpinner(false);
      });
    } else {
      video.src = PROXY_URL + '?target=' + encodeURIComponent(movieUrl);
      video.addEventListener('loadeddata', function onLoaded() {
        showSpinner(false);
        video.removeEventListener('loadeddata', onLoaded);
        // Check for embedded subtitles
        checkForEmbeddedSubtitlesRepeatedly();
      });
      video.play().catch(function(error) {
        console.error("Playback error:", error);
        showSpinner(false);
      });
    }
  }, 100);
}

// ========== M3U Parsing ==========
function parseM3U(content) {
  const lines = content.split("\n");
  const parsedChannels = [];
  let currentTitle = "";
  let channelId = 0;
  
  lines.forEach(function(line) {
    line = line.trim();
    if (!line) return;
    
    if (line.startsWith("#EXTINF")) {
      const match = line.match(/,(.*)$/);
      currentTitle = match ? match[1].trim() : "Unknown Channel";
    } else if (line.startsWith("http")) {
      parsedChannels.push({
        id: "m3u_" + channelId++,
        name: currentTitle,
        url: line,
        icon: null,
        isLive: false
      });
    }
  });
  
  allChannels = parsedChannels;
  categorizedChannels = parseChannelsIntoCategories(allChannels);
  allCategories = Object.keys(categorizedChannels);
  
  if (selectedCategories.length === 0) {
    const polishCategories = allCategories.filter(function(cat) {
      return cat.toUpperCase().startsWith("PL -") || cat.toUpperCase().startsWith("PL-");
    });
    if (polishCategories.length > 0) {
      selectedCategories = polishCategories;
      saveSelectedCategoriesToCookie(selectedCategories);
    }
  }
  
  renderChannelsByCategory();
  searchBox.style.display = "block";
  categorySearchBox.style.display = "block";
  updateFavoritesButton();
  
  const manageCategoriesBtn = document.getElementById("manageCategoriesBtn");
  const toggleCategoryHeadersBtn = document.getElementById("toggleCategoryHeadersBtn");
  if (allCategories.length > 1) {
    manageCategoriesBtn.style.display = "block";
    if (toggleCategoryHeadersBtn) {
      toggleCategoryHeadersBtn.style.display = "block";
    }
  }
}

// ========== Video Player Functions ==========
let isLoadingChannel = false;

function playChannel(url, name) {
  if (isLoadingChannel) {
    return;
  }
  
  isLoadingChannel = true;
  currentChannelDisplay.textContent = name;
  
  // Clear subtitles for live channels
  loadSubtitles([]);
  
  video.pause();
  video.src = "";
  
  if (hls) {
    hls.destroy();
    hls = null;
  }
  
  setTimeout(function() {
    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 60
      });
      
      hls.loadSource(url);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, function() {
        video.play().then(function() {
          isLoadingChannel = false;
        }).catch(function(e) {
          console.error("Playback error:", e);
          isLoadingChannel = false;
        });
      });
    
      hls.on(Hls.Events.ERROR, function(event, data) {
        if (data.fatal) {
          switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("Network error");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("Media error");
              hls.recoverMediaError();
              break;
            default:
              console.error("Fatal error");
              hls.destroy();
              isLoadingChannel = false;
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', function() {
        video.play().then(function() {
          isLoadingChannel = false;
        }).catch(function(e) {
          console.error("Playback error:", e);
          isLoadingChannel = false;
        });
      });
    }
  }, 100);
}

// ========== Control Button Functions ==========
playPauseBtn.addEventListener("click", function() {
  if (video.paused) {
    video.play();
    playPauseBtn.textContent = "⏸";
  } else {
    video.pause();
    playPauseBtn.textContent = "▶";
  }
});

stopBtn.addEventListener("click", function() {
  video.pause();
  video.currentTime = 0;
  if (hls) {
    hls.destroy();
  }
  loadSubtitles([]);
  currentChannelDisplay.textContent = "No channel selected";
  playPauseBtn.textContent = "▶";
});

const goLiveBtn = document.getElementById("goLiveBtn");
if (goLiveBtn) {
  goLiveBtn.addEventListener("click", function() {
    if (hls && hls.liveSyncPosition) {
      video.currentTime = hls.liveSyncPosition;
    } else if (video.duration) {
      video.currentTime = video.duration;
    }
  });
}

muteBtn.addEventListener("click", function() {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
});

function updateVolumeSlider(value) {
  const percent = value;
  volumeSlider.style.background = "linear-gradient(to right, #667eea 0%, #667eea " + percent + "%, #2d2d44 " + percent + "%, #2d2d44 100%)";
  volumeTooltip.textContent = Math.round(percent);
}

volumeSlider.addEventListener("input", function() {
  video.volume = volumeSlider.value / 100;
  updateVolumeSlider(volumeSlider.value);
  if (video.volume === 0) {
    video.muted = true;
    muteBtn.textContent = "🔇";
  } else {
    video.muted = false;
    muteBtn.textContent = "🔊";
  }
});

volumeSlider.addEventListener("mouseenter", function() {
  volumeTooltip.classList.add("show");
});

volumeSlider.addEventListener("mouseleave", function() {
  volumeTooltip.classList.remove("show");
});

volumeSlider.addEventListener("mousedown", function() {
  volumeTooltip.classList.add("show");
});

volumeSlider.addEventListener("mouseup", function() {
  setTimeout(function() {
    volumeTooltip.classList.remove("show");
  }, 500);
});

fullscreenBtn.addEventListener("click", function() {
  if (!document.fullscreenElement) {
    video.requestFullscreen().catch(function(err) {
      console.error("Fullscreen error:", err);
    });
  } else {
    document.exitFullscreen();
  }
});

// Subtitle Button
if (subtitleBtn && subtitleMenu) {
  subtitleBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    subtitleMenu.classList.toggle("show");
  });
  
  // Close subtitle menu when clicking outside
  document.addEventListener("click", function(e) {
    if (!subtitleBtn.contains(e.target) && !subtitleMenu.contains(e.target)) {
      subtitleMenu.classList.remove("show");
    }
  });
}

video.addEventListener("timeupdate", function() {
  if (video.duration) {
    const percent = (video.currentTime / video.duration) * 100;
    progressFilled.style.width = percent + "%";
    currentTimeDisplay.textContent = formatTime(video.currentTime);
    durationDisplay.textContent = formatTime(video.duration);
  }
});

video.addEventListener("play", function() {
  playPauseBtn.textContent = "⏸";
});

video.addEventListener("pause", function() {
  playPauseBtn.textContent = "▶";
});

progressBar.addEventListener("click", function(e) {
  if (video.duration) {
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * video.duration;
  }
});

// ========== Keyboard Controls ==========
document.addEventListener("keydown", function(e) {
  if (e.target.tagName === "INPUT") return;
  
  switch(e.key) {
    case " ":
      e.preventDefault();
      playPauseBtn.click();
      break;
    case "m":
    case "M":
      muteBtn.click();
      break;
    case "f":
    case "F":
      fullscreenBtn.click();
      break;
    case "ArrowUp":
      e.preventDefault();
      if (currentSelectedIndex > 0) {
        currentSelectedIndex--;
        channels[currentSelectedIndex].click();
      }
      break;
    case "ArrowDown":
      e.preventDefault();
      if (currentSelectedIndex < channels.length - 1) {
        currentSelectedIndex++;
        channels[currentSelectedIndex].click();
      }
      break;
    case "+":
    case "=":
      video.volume = Math.min(video.volume + 0.1, 1);
      volumeSlider.value = video.volume * 100;
      updateVolumeSlider(volumeSlider.value);
      break;
    case "-":
    case "_":
      video.volume = Math.max(video.volume - 0.1, 0);
      volumeSlider.value = video.volume * 100;
      updateVolumeSlider(volumeSlider.value);
      break;
  }
});

// ========== Event Listeners ==========

// Login Screen - Method Selection
methodBtns.forEach(function(btn) {
  btn.addEventListener("click", function() {
    const method = btn.dataset.method;
    methodBtns.forEach(function(b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");
    
    if (method === "xtream") {
      xtreamForm.classList.add("active");
      fileForm.classList.remove("active");
      urlForm.classList.remove("active");
    } else if (method === "file") {
      fileForm.classList.add("active");
      xtreamForm.classList.remove("active");
      urlForm.classList.remove("active");
    } else if (method === "url") {
      urlForm.classList.add("active");
      xtreamForm.classList.remove("active");
      fileForm.classList.remove("active");
      
      const savedUrl = loadM3uUrlFromCookie();
      if (savedUrl) {
        m3uUrlInput.value = savedUrl;
        rememberUrl.checked = true;
      }
    }
  });
});

// Connect Button - Xtream Codes

const PROXY_URL = 'proxy.php';

// --- ALMEZ0 FIREBASE FAILOVER LOGIC ---
async function fetchHostsFromServerCode(serverCode) {
    showStatus(connectionStatus, "جاري البحث عن السيرفر...", "info");
    const docRef = db.collection('server_hosts').doc(serverCode);
    const doc = await docRef.get();
    
    if (!doc.exists) {
        throw new Error('كود السيرفر غير صحيح');
    }
    
    const data = doc.data();
    const urls = [];
    for (let key in data) {
        if (key.startsWith('host_url_')) {
            urls.push({ key: key, url: data[key] });
        }
    }
    urls.sort((a, b) => a.key.localeCompare(b.key));
    const sortedUrls = urls.map(item => item.url);
    if (sortedUrls.length === 0) {
        throw new Error('لا توجد خوادم متاحة لهذا الكود');
    }
    return sortedUrls;
}

// --- OVERRIDE CONNECT BTN ---

connectBtn.addEventListener("click", async function() {
  const serverCode = serverCodeInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!serverCode || !username || !password) {
    showStatus(connectionStatus, "الرجاء تعبئة كافة الحقول", "error");
    return;
  }
  
  showSpinner(true);
  try {
      const sortedUrls = await fetchHostsFromServerCode(serverCode);
      
      async function tryHost(index) {
          if (index >= sortedUrls.length) {
              showStatus(connectionStatus, "عذراً، جميع خوادم هذا السيرفر لا تستجيب حالياً", "error");
              showSpinner(false);
              return;
          }
          const currentHost = sortedUrls[index];
          showStatus(connectionStatus, `جاري الاتصال بالخادم ${index + 1}...`, "info");
          
          const config = await testXtreamConnection(currentHost, username, password);
          if (config) {
              currentXtreamConfig = config;
              if (rememberMe.checked) {
                  saveCredentialsToCookie(serverCode, username, password);
              }
              const success = await loadXtreamChannels(config);
              if (success) {
                  await loadXtreamMovies(config);
                  setTimeout(function() {
                      showMainApp(true);
                  }, 500);
              }
          } else {
              tryHost(index + 1);
          }
      }
      
      tryHost(0);
      
  } catch (error) {
      console.error(error);
      showStatus(connectionStatus, error.message, "error");
      showSpinner(false);
  }
});


// Use Saved Credentials Button
useSavedBtn.addEventListener("click", async function() {
  const savedCreds = loadCredentialsFromCookie();
  if (savedCreds) {
    const config = await testXtreamConnection(savedCreds.host, savedCreds.username, savedCreds.password);
    
    if (config) {
      currentXtreamConfig = config;
      const success = await loadXtreamChannels(config);
      if (success) {
        await loadXtreamMovies(config);
        setTimeout(function() {
          showMainApp(true);
        }, 500);
      }
    }
  }
});

// Clear Saved Credentials
clearSavedBtn.addEventListener("click", function() {
  clearCredentialsCookie();
  savedCredentials.style.display = "none";
  showStatus(connectionStatus, "Saved credentials cleared", "info");
  setTimeout(function() {
    connectionStatus.classList.remove("show");
  }, 2000);
});

// M3U File Upload (Login)
m3uFileLogin.addEventListener("change", function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  showStatus(fileStatus, "Loading M3U file...", "info");
  
  const reader = new FileReader();
  reader.onload = function(e) {
    parseM3U(e.target.result);
    showMainApp(false);
    showStatus(fileStatus, "M3U file loaded successfully!", "success");
  };
  reader.onerror = function() {
    showStatus(fileStatus, "Error reading file", "error");
  };
  reader.readAsText(file);
});

// M3U URL Load Button
loadUrlBtn.addEventListener("click", async function() {
  const url = m3uUrlInput.value.trim();
  
  if (!url) {
    showStatus(urlStatus, "Please enter a playlist URL", "error");
    return;
  }
  
  try {
    new URL(url);
  } catch (e) {
    showStatus(urlStatus, "Invalid URL format", "error");
    return;
  }
  
  showSpinner(true);
  showStatus(urlStatus, "Loading playlist from URL...", "info");
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("HTTP error! status: " + response.status);
    }
    
    const content = await response.text();
    
    if (!content.includes("#EXTM3U")) {
      throw new Error("Invalid M3U playlist format");
    }
    
    if (rememberUrl.checked) {
      saveM3uUrlToCookie(url);
    } else {
      clearM3uUrlCookie();
    }
    
    parseM3U(content);
    showMainApp(false);
    showSpinner(false);
    showStatus(urlStatus, "Playlist loaded successfully!", "success");
    
    console.log("Loaded M3U playlist from URL: " + url);
  } catch (error) {
    console.error("Error loading M3U URL:", error);
    showStatus(urlStatus, "Failed to load playlist: " + error.message, "error");
    showSpinner(false);
  }
});

const btnUpload = document.querySelector(".btn-upload");
if (btnUpload) {
  btnUpload.addEventListener("click", function() {
    m3uFileLogin.click();
  });
}

const fileUploadArea = document.querySelector(".file-upload-area");
if (fileUploadArea) {
  fileUploadArea.addEventListener("click", function(e) {
    if (e.target.tagName !== 'BUTTON') {
      m3uFileLogin.click();
    }
  });
}

// Tab Switching
tabBtns.forEach(function(btn) {
  btn.addEventListener("click", function() {
    const tab = this.dataset.tab;
    
    tabBtns.forEach(function(b) {
      b.classList.remove("active");
    });
    this.classList.add("active");
    
    currentTab = tab;
    
    // Clear search boxes when switching tabs
    searchBox.value = "";
    categorySearchBox.value = "";
    
    if (tab === "iptv") {
      channelsContainer.style.display = "block";
      moviesContainer.style.display = "none";
      sidebarTitle.textContent = "Channels";
      searchBox.placeholder = "🔍 Search (press Enter)...";
      categorySearchBox.placeholder = "🔍 Filter (press Enter)...";
      categorySearchBox.style.display = "block";
      if (goLiveBtn) {
        goLiveBtn.style.display = "block";
      }
      renderChannelsByCategory();
    } else if (tab === "movies") {
      channelsContainer.style.display = "none";
      moviesContainer.style.display = "block";
      sidebarTitle.textContent = "Movies";
      searchBox.placeholder = "🔍 Search movies (press Enter)...";
      categorySearchBox.style.display = "none";
      searchBox.value = "";
      if (goLiveBtn) {
        goLiveBtn.style.display = "none";
      }
      renderMovies();
    }
  });
});

// Logout Button
logoutBtn.addEventListener("click", function() {
  if (confirm("Are you sure you want to logout?")) {
    mainApp.style.display = "none";
    loginScreen.style.display = "flex";
    const headerControls = document.getElementById("headerControls");
    if (headerControls) {
      headerControls.style.display = "none";
    }
    if (tabSwitcher) {
      tabSwitcher.style.display = "none";
    }
    channels = [];
    allChannels = [];
    categorizedChannels = {};
    allCategories = [];
    allMovies = [];
    categorizedMovies = {};
    allMovieCategories = [];
    channelsContainer.innerHTML = "";
    moviesContainer.innerHTML = "";
    video.src = "";
    currentChannelDisplay.textContent = "No channel selected";
    searchBox.value = "";
    searchBox.style.display = "none";
    categorySearchBox.value = "";
    categorySearchBox.style.display = "none";
    currentSelectedIndex = -1;
    currentTab = "iptv";
    tabBtns.forEach(function(btn) {
      btn.classList.remove("active");
      if (btn.dataset.tab === "iptv") {
        btn.classList.add("active");
      }
    });
    const manageCategoriesBtn = document.getElementById("manageCategoriesBtn");
    manageCategoriesBtn.style.display = "none";
    const toggleCategoryHeadersBtn = document.getElementById("toggleCategoryHeadersBtn");
    if (toggleCategoryHeadersBtn) {
      toggleCategoryHeadersBtn.style.display = "none";
    }
  }
});

// Toggle Favorites Button
toggleFavoritesBtn.addEventListener("click", function() {
  showOnlyFavorites = !showOnlyFavorites;
  renderChannelsByCategory();
  updateFavoritesButton();
});

// Toggle Category Headers Button
const toggleCategoryHeadersBtn = document.getElementById("toggleCategoryHeadersBtn");
if (toggleCategoryHeadersBtn) {
  toggleCategoryHeadersBtn.addEventListener("click", function() {
    showCategoryHeaders = !showCategoryHeaders;
    const btnText = document.getElementById("categoryHeadersText");
    if (btnText) {
      btnText.textContent = showCategoryHeaders ? "\ud83d\udcc2 Hide Categories" : "\ud83d\udcc3 Show Categories";
    }
    renderChannelsByCategory();
  });
}

// Manage Categories Button
const manageCategoriesBtn = document.getElementById("manageCategoriesBtn");
const categoriesModal = document.getElementById("categoriesModal");
const closeCategoriesModal = document.getElementById("closeCategoriesModal");
const categoriesList = document.getElementById("categoriesList");
const categoriesSearch = document.getElementById("categoriesSearch");
const selectAllCategories = document.getElementById("selectAllCategories");
const deselectAllCategories = document.getElementById("deselectAllCategories");
const selectPolishCategories = document.getElementById("selectPolishCategories");
const applyCategoriesBtn = document.getElementById("applyCategoriesBtn");

manageCategoriesBtn.addEventListener("click", function() {
  categoriesList.innerHTML = "";
  categoriesSearch.value = "";
  
  function renderCategoriesList(filter) {
    categoriesList.innerHTML = "";
    const filterLower = filter ? filter.toLowerCase() : "";
    
    allCategories.forEach(function(categoryName) {
      if (filterLower && !categoryName.toLowerCase().includes(filterLower)) {
        return;
      }
      
      const categoryItem = document.createElement("div");
      categoryItem.className = "category-item";
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "cat_" + categoryName;
      checkbox.value = categoryName;
      checkbox.checked = selectedCategories.length === 0 || selectedCategories.indexOf(categoryName) > -1;
      
      const label = document.createElement("label");
      label.htmlFor = "cat_" + categoryName;
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "category-item-name";
      nameSpan.textContent = categoryName;
      
      const countSpan = document.createElement("span");
      countSpan.className = "category-item-count";
      const count = categorizedChannels[categoryName].length;
      const countText = count + " channel" + (count !== 1 ? 's' : '');
      countSpan.textContent = countText;
      
      label.appendChild(nameSpan);
      label.appendChild(countSpan);
      
      categoryItem.appendChild(checkbox);
      categoryItem.appendChild(label);
      
      categoriesList.appendChild(categoryItem);
    });
  }
  
  renderCategoriesList("");
  
  categoriesSearch.oninput = function(e) {
    renderCategoriesList(e.target.value);
  };
  
  categoriesModal.classList.add("show");
});

closeCategoriesModal.addEventListener("click", function() {
  categoriesModal.classList.remove("show");
});

categoriesModal.addEventListener("click", function(e) {
  if (e.target === categoriesModal) {
    categoriesModal.classList.remove("show");
  }
});

selectAllCategories.addEventListener("click", function() {
  const checkboxes = categoriesList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    cb.checked = true;
  });
});

deselectAllCategories.addEventListener("click", function() {
  const checkboxes = categoriesList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    cb.checked = false;
  });
});

selectPolishCategories.addEventListener("click", function() {
  const checkboxes = categoriesList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    const categoryName = cb.value.toUpperCase();
    if (categoryName.startsWith("PL -") || categoryName.startsWith("PL-")) {
      cb.checked = true;
    }
  });
});

applyCategoriesBtn.addEventListener("click", function() {
  const checkboxes = categoriesList.querySelectorAll('input[type="checkbox"]:checked');
  selectedCategories = Array.from(checkboxes).map(function(cb) {
    return cb.value;
  });
  saveSelectedCategoriesToCookie(selectedCategories);
  renderChannelsByCategory();
  categoriesModal.classList.remove("show");
  console.log("Selected categories:", selectedCategories);
});

// Search Box - General search across ALL channels or movies (trigger on Enter key)
searchBox.addEventListener("keypress", function(e) {
  if (e.key !== "Enter") return;
  
  const searchTerm = e.target.value.toLowerCase();
  
  if (currentTab === "iptv") {
    if (searchTerm === "") {
      renderChannelsByCategory();
    } else {
      showSpinner(true);
      // Search ALL channels regardless of category selection
      const filtered = allChannels.filter(function(ch) {
        return ch.name.toLowerCase().indexOf(searchTerm) > -1;
      });
      renderChannels(filtered);
      showSpinner(false);
    }
  } else if (currentTab === "movies") {
    if (searchTerm === "") {
      renderMovies();
    } else {
      showSpinner(true);
      // Search all movies
      const filtered = allMovies.filter(function(movie) {
        return movie.name.toLowerCase().indexOf(searchTerm) > -1;
      });
      
      if (filtered.length === 0) {
        moviesContainer.innerHTML = '<div class="no-channels"><p>No movies found</p></div>';
        channelCountDisplay.textContent = "0 movies";
      } else {
        renderMovies(filtered, 10);
      }
      showSpinner(false);
    }
  }
});

// Category Search Box - Filters within currently selected categories only (trigger on Enter key)
categorySearchBox.addEventListener("keypress", function(e) {
  if (e.key !== "Enter") return;
  
  const searchTerm = e.target.value.toLowerCase();
  if (searchTerm === "") {
    renderChannelsByCategory();
  } else {
    showSpinner(true);
    // Filter only within selected categories
    const visibleChannelsList = [];
    Object.keys(categorizedChannels).forEach(function(category) {
      if (selectedCategories.indexOf(category) > -1) {
        visibleChannelsList.push.apply(visibleChannelsList, categorizedChannels[category]);
      }
    });
    
    const filtered = visibleChannelsList.filter(function(ch) {
      return ch.name.toLowerCase().indexOf(searchTerm) > -1;
    });
    renderChannels(filtered);
    showSpinner(false);
  }
});

// M3U Info Modal
const showM3uInfo = document.getElementById("showM3uInfo");
const m3uInfoModal = document.getElementById("m3uInfoModal");
const closeModal = document.getElementById("closeModal");
const copyExample = document.getElementById("copyExample");

showM3uInfo.addEventListener("click", function() {
  m3uInfoModal.classList.add("show");
});

closeModal.addEventListener("click", function() {
  m3uInfoModal.classList.remove("show");
});

m3uInfoModal.addEventListener("click", function(e) {
  if (e.target === m3uInfoModal) {
    m3uInfoModal.classList.remove("show");
  }
});

copyExample.addEventListener("click", function() {
  const exampleText = document.getElementById("m3uExample").textContent;
  navigator.clipboard.writeText(exampleText).then(function() {
    copyExample.textContent = "Copied!";
    setTimeout(function() {
      copyExample.textContent = "Copy";
    }, 2000);
  });
});

// ========== Initialize ==========
window.addEventListener("DOMContentLoaded", async function() {
  // Initialize volume slider fill
  updateVolumeSlider(volumeSlider.value);
  
  favoriteChannelIds = loadFavoritesFromCookie();
  
  const savedCategoriesFromCookie = loadSelectedCategoriesFromCookie();
  if (savedCategoriesFromCookie.length === 0) {
    selectedCategories = [];
  } else {
    selectedCategories = savedCategoriesFromCookie;
  }
  
  console.log("Loaded favorites:", favoriteChannelIds);
  console.log("Loaded selected categories:", selectedCategories);
  
  const savedCreds = loadCredentialsFromCookie();
  if (savedCreds) {
    savedCredentials.style.display = "block";
    
    const config = await testXtreamConnection(savedCreds.host, savedCreds.username, savedCreds.password);
    if (config) {
      currentXtreamConfig = config;
      const success = await loadXtreamChannels(config);
      if (success) {
        await loadXtreamMovies(config);
        showMainApp(true);
      }
    }
  }
  
  const savedUrl = loadM3uUrlFromCookie();
  if (savedUrl && !savedCreds) {
    rememberUrl.checked = true;
    m3uUrlInput.value = savedUrl;
  }
});
