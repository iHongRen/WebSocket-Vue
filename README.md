# WebSocket-Vue
使用 **Vue3** 封装 **WebSocket** ,支持心跳检查、断线重连



##如何使用

1、在 main.js 中将 useSocket 注入到 provide 中

```javascript
// main.js
import { createApp } from 'vue'
import App from './App.vue'
import useSocket from '@utils/socket/useSocket' // your path

const app = createApp(App)
const socket = useSocket()
app.provide('useSocket', socket) // 将 WebSocket 对象注入到应用程序的 provide 中

app.mount('#app')

export default app
```

2、在需要的页面使用：

```javascript
// chat.vue
import { inject, watch } from 'vue'

const useSocket = inject('useSocket')

watch(() => useSocket.chatMessage.value, (msg) => {
  console.log(msg)
})
```

