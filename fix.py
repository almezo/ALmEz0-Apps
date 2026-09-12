import re
with open('d:/My File/ALmEz0/1- Site - Copy/splayer.js', 'r', encoding='utf-8') as f:
    content = f.read()

fixed = re.sub(
    r"art\.on\('error', \(error\) => \{.*?(?=function togglePasswordVisibility)",
    """art.on('error', (error) => {
        console.error('ArtPlayer Error:', error);
        art.notice.show = "Stream is currently unavailable.";
    });
}

function refreshPlayer() {
    if (currentStreamInfo) {
        playStream(
            currentStreamInfo.id, 
            currentStreamInfo.type, 
            currentStreamInfo.extension, 
            currentStreamInfo.name, 
            currentStreamInfo.icon
        );
    }
}

// ==========================================
// MOVIE DETAILS SCREEN
// ==========================================
async function showMovieDetails(movieId, name, cover, ext) {
    showScreen('movie-details-screen');
    
    // Set basic info immediately
    document.getElementById('movieTitle').innerText = name;
    document.getElementById('moviePoster').src = cover || 'photo/logo.ico';
    document.getElementById('movieBackdrop').style.backgroundImage = `url('${cover}')`;
    document.getElementById('btnMovieFav').onclick = () => toggleFavorite(movieId, 'vod');
    
    document.getElementById('btnWatchMovie').onclick = () => {
        showScreen('live-screen'); // Reusing live-screen player
        playStream(movieId, 'vod', ext, name, cover);
    };

    const host = sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    
    // Fetch Movie Info
    const infoUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_vod_info&vod_id=${movieId}`;
    
    try {
        const data = await proxyFetch(infoUrl);
        const info = data.info || {};
        
        const genre = info.genre || 'Movie';
        const duration = info.duration ? info.duration : '';
        const country = info.country ? info.country : '';
        let metaParts = [genre];
        if(duration) metaParts.push(duration);
        if(country) metaParts.push(country);
        
        document.getElementById('movieGenre').innerText = metaParts.join(' | ');
        document.getElementById('movieRating').innerText = info.rating || 'N/A';
        document.getElementById('moviePlot').innerText = info.plot || info.description || 'لا توجد قصة متاحة.';
        document.getElementById('movieDirector').innerText = info.director || 'غير معروف';
        document.getElementById('movieCast').innerText = info.cast || info.actors || 'غير معروف';
        if (info.backdrop_path && info.backdrop_path.length > 0) {
            document.getElementById('movieBackdrop').style.backgroundImage = `url('${info.backdrop_path[0]}')`;
        }
    } catch (e) {
        console.error(e);
        // Fallback info already set
    }
}

// ==========================================
// PROFILE SCREEN
// ==========================================
function loadProfileData() {
    if(!state.userInfo) return;
    const u = state.userInfo;
    
    document.getElementById('profileUsername').innerText = u.username || 'غير معروف';
    
    const statusEl = document.getElementById('profileStatus');
    const isActive = (u.status === 'Active' || u.status === 'نشط' || u.status === 'active');
    
    if (isActive) {
        statusEl.innerText = 'متصل';
        statusEl.style.color = '#4caf50';
        statusEl.style.borderColor = 'rgba(76, 175, 80, 0.3)';
        statusEl.style.background = 'rgba(76, 175, 80, 0.1)';
    } else {
        statusEl.innerText = 'غير متصل';
        statusEl.style.color = '#f44336';
        statusEl.style.borderColor = 'rgba(244, 67, 54, 0.3)';
        statusEl.style.background = 'rgba(244, 67, 54, 0.1)';
    }
    
    document.getElementById('profileType').innerText = u.is_trial === "1" ? 'Trial Account' : 'حساب نشط';
    document.getElementById('profileMaxConn').innerText = u.max_connections || '1';
    document.getElementById('profileنشطConn').innerText = u.active_cons || '0';
    
    const formatDate = (timestamp) => {
        if(!timestamp || timestamp === "null") return 'Unlimited';
        const d = new Date(timestamp * 1000);
        return d.toDateString();
    };
    
    document.getElementById('profileCreatedAt').innerText = formatDate(u.created_at);
    document.getElementById('profileExpAt').innerText = formatDate(u.exp_date);
}

// ==========================================
// SERIES DETAILS SCREEN
// ==========================================
async function showSeriesDetails(seriesId, name, cover) {
    showScreen('series-details-screen');
    
    // Set basic info immediately
    document.getElementById('seriesTitle').innerText = name;
    document.getElementById('seriesTitleBottom').innerText = name;
    document.getElementById('seriesPoster').src = cover || 'photo/logo.ico';
    document.getElementById('seriesBackdrop').style.backgroundImage = `url('${cover}')`;
    document.getElementById('btnSeriesFav').onclick = () => toggleFavorite(seriesId, 'series');
    
    const host = sessionStorage.getItem('sp_host');
    const user = encodeURIComponent(state.username);
    const pass = encodeURIComponent(state.password);
    
    // 1. Fetch Series Info
    const infoUrl = `${host}/player_api.php?username=${user}&password=${pass}&action=get_series_info&series_id=${seriesId}`;
    
    const container = document.getElementById('seasonsContainer');
    container.innerHTML = '<div class="empty-state" style="margin-top: 50px;">جاري تحميل الحلقات...</div>';
    
    try {
        const data = await proxyFetch(infoUrl);
        const info = data.info || {};
        
        document.getElementById('seriesGenre').innerText = info.genre || 'Series';
        document.getElementById('seriesRating').innerText = info.rating || 'N/A';
        document.getElementById('seriesPlot').innerText = info.plot || 'لا توجد قصة متاحة.';
        document.getElementById('seriesDirector').innerText = info.director || 'غير معروف';
        document.getElementById('seriesCast').innerText = info.cast || 'غير معروف';
        if (info.backdrop_path && info.backdrop_path.length > 0) {
            document.getElementById('seriesBackdrop').style.backgroundImage = `url('${info.backdrop_path[0]}')`;
        }

        // 2. Render Episodes grouped by Season
        container.innerHTML = '';
        const episodes = data.episodes || {};
        
        for (let seasonNum in episodes) {
            const seasonData = episodes[seasonNum];
            
            const seasonDiv = document.createElement('div');
            seasonDiv.className = 'season-row';
            
            seasonDiv.innerHTML = `
                <div class="season-title">موسم ${seasonNum}</div>
                <div class="episodes-grid" id="epGrid_s${seasonNum}"></div>
            `;
            container.appendChild(seasonDiv);
            
            const epGrid = document.getElementById(`epGrid_s${seasonNum}`);
            seasonData.forEach(ep => {
                const epCard = document.createElement('div');
                epCard.className = 'episode-card';
                
                let epCover = ep.info && ep.info.movie_image ? ep.info.movie_image : cover;
                let epTitle = ep.title || `حلقة ${ep.episode_num}`;
                
                epCard.innerHTML = `
                    <img src="${epCover}" class="episode-thumb" onerror="this.src='photo/logo.ico'">
                    <div class="episode-title" title="${epTitle}">${epTitle}</div>
                `;
                epCard.onclick = () => {
                    showScreen('live-screen'); // Reusing live-screen player
                    playStream(ep.id, 'series', ep.container_extension || 'mp4', epTitle, epCover);
                };
                
                epGrid.appendChild(epCard);
            });
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">Failed to load series data</div>';
    }
}
""",
    content,
    flags=re.DOTALL
)

with open('d:/My File/ALmEz0/1- Site - Copy/splayer.js', 'w', encoding='utf-8') as f:
    f.write(fixed)
