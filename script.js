const socket = io();
let userName = "Гость";
let currentRoomId = "";

// Глобальные переменные плеера
let ytPlayer = null;
let vkPlayer = null;
let activePlayerType = null;
let isRemoteAction = false; 

// --- ИНИЦИАЛИЗАЦИЯ ---
window.onload = function() {
    // 1. Установка ID комнаты
    const urlParams = new URLSearchParams(window.location.search);
    currentRoomId = urlParams.get('room');
    
    if (!currentRoomId) {
        currentRoomId = Math.floor(Math.random() * 9000000 + 1000000).toString();
        const newUrl = window.location.pathname + '?room=' + currentRoomId;
        window.history.pushState({path: newUrl}, '', newUrl);
    }
    
    document.getElementById('room-id-display').innerText = currentRoomId;
    document.getElementById('current-room-id').innerText = currentRoomId;

    // 2. Проверка имени пользователя в LocalStorage (сохраняем куки)
    const savedName = localStorage.getItem('ur_username');
    if (savedName) {
        document.getElementById('username').value = savedName;
        // Если хотим, чтобы после F5 сразу входил в комнату (без нажатия кнопки "Войти"):
        showMain(true); 
    }
};

// Функция входа
function showMain(autoLogin = false) {
    const nameInput = document.getElementById('username');
    const name = nameInput.value.trim();
    
    if (!name) return alert("Введите имя!");
    
    userName = name;
    // Сохраняем имя в браузер, чтобы не вводить после F5
    localStorage.setItem('ur_username', name);
    
    socket.emit('join_room', currentRoomId);
    
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');
}

document.getElementById('username').addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') showMain(); 
});
document.getElementById('video-input').addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') startSearch(); 
});

// --- ВИДЕО ЛОГИКА ---
function startSearch() {
    const url = document.getElementById('video-input').value.trim();
    if (url) socket.emit('change_video', { room: currentRoomId, url: url });
}

// Получение видео от сервера (при поиске или восстановлении после F5)
socket.on('update_video', (data) => {
    // Безопасное извлечение URL
    const url = (typeof data === 'object' && data.url) ? data.url : (data || "");
    if (!url) return;

    document.getElementById('video-input').value = url;
    loadVideo(url);
});

function loadVideo(url) {
    const container = document.getElementById('player-container');
    const placeholder = document.getElementById('player-placeholder');
    
    container.innerHTML = "";
    placeholder.classList.add('hidden');
    
    if (ytPlayer && typeof ytPlayer.destroy === 'function') ytPlayer.destroy();
    ytPlayer = null;
    vkPlayer = null;
    activePlayerType = null;

    // --- YOUTUBE ---
    if (url.includes('youtu')) {
        activePlayerType = 'yt';
        const match = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=|\/shorts\/))([\w\-]{10,12})/);
        const videoId = match ? match[1] : null;

        if (videoId) {
            let ytDiv = document.createElement('div');
            ytDiv.id = 'yt-player-frame';
            container.appendChild(ytDiv);

            ytPlayer = new YT.Player('yt-player-frame', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: { 'autoplay': 1, 'controls': 1 },
                events: {
                    'onStateChange': onYtStateChange
                }
            });
        }
    }
    // --- VK VIDEO ---
    else if (url.includes('vk.com')) {
        activePlayerType = 'vk';
        const match = url.match(/video(-?\d+)_(\d+)/);
        
        if (match) {
            const iframe = document.createElement('iframe');
            iframe.id = "vk-player-frame"; 
            iframe.src = `https://vk.com/video_ext.php?oid=${match[1]}&id=${match[2]}&hd=2&autoplay=1&js_api=1`;
            iframe.width = "100%";
            iframe.height = "100%";
            iframe.frameBorder = "0";
            iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
            iframe.allowFullscreen = true;
            container.appendChild(iframe);

            setTimeout(() => {
                try {
                    vkPlayer = VK.VideoPlayer(iframe);
                    vkPlayer.on('play', () => { 
                        if(!isRemoteAction) sendSync('play'); 
                    });
                    vkPlayer.on('pause', () => { 
                        if(!isRemoteAction) sendSync('pause'); 
                    });
                } catch (e) { console.error("Ошибка ВК плеера:", e); }
            }, 1000); 
        }
    }
}

// --- СИНХРОНИЗАЦИЯ ПАУЗЫ ---
function onYtStateChange(event) {
    if (isRemoteAction) return; 
    if (event.data === YT.PlayerState.PLAYING) sendSync('play');
    else if (event.data === YT.PlayerState.PAUSED) sendSync('pause');
}

function sendSync(action) {
    socket.emit('video_action', { room: currentRoomId, action: action });
}

socket.on('video_action', (action) => {
    isRemoteAction = true; 

    if (activePlayerType === 'yt' && ytPlayer && typeof ytPlayer.playVideo === 'function') {
        if (action === 'play') ytPlayer.playVideo();
        if (action === 'pause') ytPlayer.pauseVideo();
    } 
    else if (activePlayerType === 'vk' && vkPlayer) {
        if (action === 'play') vkPlayer.play();
        if (action === 'pause') vkPlayer.pause();
    }

    setTimeout(() => { isRemoteAction = false; }, 800);
});

// --- ЧАТ И СОХРАНЕНИЕ ---
function sendMsg() {
    const input = document.getElementById('chat-msg');
    const val = input.value.trim();
    if (val) {
        socket.emit('send_msg', { room: currentRoomId, user: userName, text: val });
        input.value = "";
    }
}

document.getElementById('chat-msg').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMsg();
});

// Функция для отрисовки сообщения в UI
function renderMessage(user, text) {
    const chat = document.getElementById('chat-messages');
    const color = user === userName ? '#e50914' : '#aaaaaa'; // Выделяем свои сообщения красным
    chat.innerHTML += `<div><b style="color:${color}">${user}:</b> ${text}</div>`;
    chat.scrollTop = chat.scrollHeight;
}

// Получение одного нового сообщения
socket.on('new_msg', (data) => {
    renderMessage(data.user, data.text);
});

// Получение истории чата от сервера при F5
socket.on('chat_history', (history) => {
    const chat = document.getElementById('chat-messages');
    chat.innerHTML = ''; // Очищаем (на случай если там приветственный текст)
    
    history.forEach(msg => {
        renderMessage(msg.user, msg.text);
    });
});

// --- ПРОЧЕЕ ---
function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    alert("Ссылка скопирована!");
}