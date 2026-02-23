const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));

// Хранилище состояния комнат в памяти сервера
// Формат: { "1234567": { url: "https://...", chat: [ {user: "Имя", text: "Привет"} ] } }
const roomsData = {};

io.on('connection', (socket) => {
    console.log('Новое подключение');

    // 1. ВХОД В КОМНАТУ
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`Пользователь зашел в комнату: ${roomId}`);

        // Инициализируем комнату, если её еще не было в памяти
        if (!roomsData[roomId]) {
            roomsData[roomId] = { url: "", chat: [] };
        }

        // --- ВОССТАНОВЛЕНИЕ ДАННЫХ ПРИ ВХОДЕ (ИЛИ ПЕРЕЗАГРУЗКЕ) ---
        // Если в комнате уже есть видео, отправляем его новому/переподключившемуся пользователю
        if (roomsData[roomId].url) {
            socket.emit('update_video', roomsData[roomId].url);
        }

        // Если в комнате уже есть история чата, отправляем её
        if (roomsData[roomId].chat.length > 0) {
            socket.emit('chat_history', roomsData[roomId].chat);
        }
    });

    // 2. СМЕНА ВИДЕО
    socket.on('change_video', (data) => {
        // Запоминаем новую ссылку для этой комнаты на сервере
        if (!roomsData[data.room]) roomsData[data.room] = { url: "", chat: [] };
        roomsData[data.room].url = data.url;

        // Отправляем всем (и себе тоже) команду обновить видео
        io.to(data.room).emit('update_video', data.url);
    });

    // 3. ЧАТ
    socket.on('send_msg', (data) => {
        // Сохраняем сообщение в историю на сервере
        if (!roomsData[data.room]) roomsData[data.room] = { url: "", chat: [] };
        roomsData[data.room].chat.push({ user: data.user, text: data.text });
        
        // Ограничиваем историю чата (чтобы память не забивалась, храним последние 100 сообщений)
        if (roomsData[data.room].chat.length > 100) {
            roomsData[data.room].chat.shift();
        }

        // Отправляем новое сообщение всем в комнате
        io.to(data.room).emit('new_msg', data);
    });

    // 4. СИНХРОНИЗАЦИЯ (ПАУЗА / ПЛЕЙ)
    socket.on('video_action', (data) => {
        socket.to(data.room).emit('video_action', data.action);
    });

    socket.on('disconnect', () => {
        console.log('Пользователь отключился');
    });
});

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Сервер запущен! Ссылка: http://localhost:${PORT}`);
});