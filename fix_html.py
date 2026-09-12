import re

def fix_html():
    with open('d:/My File/ALmEz0/1- Site - Copy/player.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # We will replace the entire live-screen and vod-screen blocks.
    
    live_screen_pattern = r'<!-- MAIN APP: LIVE TV -->(.*?)<!-- MAIN APP: VOD/SERIES \(Grid\) -->'
    
    new_live_screen = """
<!-- MAIN APP: LIVE TV -->
<div class="app-screen-container app-screen hidden" id="live-screen" dir="rtl">
    <div class="col-sidebar">
        <div class="col-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px;">
            <h3 id="liveCategoryTitle" style="margin:0;">الأقسام</h3>
            <div class="header-actions" style="display: flex; gap: 15px; position: relative;">
                <i class="fas fa-search header-icon" title="بحث" onclick="document.getElementById('liveSearchWrap').classList.toggle('hidden')"></i>
            </div>
        </div>
        <div id="liveSearchWrap" class="hidden" style="padding: 0 15px 15px 15px;">
            <input class="search-input" id="searchLiveCategories" placeholder="البحث في الأقسام..." type="text" style="width: 100%;"/>
        </div>
        <div class="list-container" id="liveCategories">
            <!-- Loaded dynamically -->
        </div>
    </div>
    
    <div class="col-list">
        <div class="col-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px;">
            <i class="fas fa-arrow-right back-icon" onclick="switchTab('dashboard', null)"></i>
            <h3 style="margin:0;">القنوات</h3>
            <div class="header-actions" style="display: flex; gap: 15px; position: relative;">
                <i class="fas fa-search header-icon" title="بحث" onclick="document.getElementById('liveItemsSearchWrap').classList.toggle('hidden')"></i>
                <i class="fas fa-ellipsis-v header-icon" onclick="document.getElementById('liveMenu').classList.toggle('hidden')"></i>
                <div id="liveMenu" class="header-dropdown hidden">
                    <div class="dropdown-item" onclick="openSortModal('live'); document.getElementById('liveMenu').classList.add('hidden')"><i class="fas fa-sort"></i> الترتيب</div>
                </div>
            </div>
        </div>
        <div id="liveItemsSearchWrap" class="hidden" style="padding: 0 15px 15px 15px;">
            <input class="search-input" id="searchLiveItems" placeholder="البحث في القنوات..." type="text" style="width: 100%;"/>
        </div>
        <div class="list-container" id="liveChannels">
            <!-- Loaded dynamically -->
        </div>
    </div>
    
    <div class="col-player">
        <div class="player-wrapper">
            <div class="player-top-header hidden" id="playerTopHeader">
                <div class="channel-info-header">
                    <img alt="Channel Icon" id="playingChannelIcon" onerror="this.src='photo/logo.ico'" src=""/>
                    <span id="playingChannelName">اسم القناة</span>
                </div>
                <div class="player-controls-row">
                    <div class="player-action-btns">
                        <button class="action-btn" title="Favorite" onclick="if(currentStreamInfo) toggleFavorite(currentStreamInfo.id, currentStreamInfo.type)"><i class="fas fa-heart"></i></button>
                        <button class="action-btn" onclick="refreshPlayer()" title="Refresh"><i class="fas fa-sync-alt"></i></button>
                    </div>
                </div>
            </div>
            <div class="plyr-container" id="livePlayerWrapper">
                <div class="empty-state">اختر قناة للمشاهدة</div>
            </div>
        </div>
    </div>
</div>
<!-- MAIN APP: VOD/SERIES (Grid) -->"""

    vod_screen_pattern = r'<!-- MAIN APP: VOD/SERIES \(Grid\) -->(.*?)<!-- MAIN APP: SERIES DETAILS SCREEN -->'
    
    new_vod_screen = """
<!-- MAIN APP: VOD/SERIES (Grid) -->
<div class="app-screen-container app-screen hidden" id="vod-screen" dir="rtl">
    <div class="col-sidebar">
        <div class="col-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px;">
            <h3 id="vodSidebarTitle" style="margin:0;">الأقسام</h3>
            <div class="header-actions" style="display: flex; gap: 15px; position: relative;">
                <i class="fas fa-search header-icon" title="بحث" onclick="document.getElementById('vodSearchWrap').classList.toggle('hidden')"></i>
                <i class="fas fa-ellipsis-v header-icon" onclick="document.getElementById('vodMenu').classList.toggle('hidden')"></i>
                <div id="vodMenu" class="header-dropdown hidden">
                    <div class="dropdown-item" onclick="toggleHideNames(); document.getElementById('vodMenu').classList.add('hidden')"><i class="fas fa-eye-slash"></i> إخفاء الاسم</div>
                    <div class="dropdown-item" onclick="openSortModal('vod'); document.getElementById('vodMenu').classList.add('hidden')"><i class="fas fa-sort"></i> الترتيب</div>
                </div>
            </div>
        </div>
        <div id="vodSearchWrap" class="hidden" style="padding: 0 15px 15px 15px; display: flex; flex-direction: column; gap: 10px;">
            <input class="search-input" id="searchVodItems" placeholder="البحث في الأفلام/المسلسلات..." type="text" style="width: 100%;"/>
            <input class="search-input" id="searchVodCategories" placeholder="البحث في الأقسام..." type="text" style="width: 100%;"/>
        </div>
        <div class="list-container" id="vodCategories">
            <!-- الأقسام loaded dynamically -->
        </div>
    </div>
    <div class="col-player gen-style-21">
        <div class="vod-grid gen-style-22" id="vodGrid">
            <!-- Posters loaded dynamically -->
        </div>
    </div>
</div>
<!-- MAIN APP: SERIES DETAILS SCREEN -->"""

    html = re.sub(live_screen_pattern, new_live_screen, html, flags=re.DOTALL)
    html = re.sub(vod_screen_pattern, new_vod_screen, html, flags=re.DOTALL)
    
    # Also fix ID "vodالأقسام" if it was present
    html = html.replace('id="vodالأقسام"', 'id="vodCategories"')
    html = html.replace('id="liveالأقسام"', 'id="liveCategories"')
    
    with open('d:/My File/ALmEz0/1- Site - Copy/player.html', 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == '__main__':
    fix_html()
