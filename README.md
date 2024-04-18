# WebSocket-Vue 封装, 支持心跳检测和断线重连

客户端对于 WebSocket 的封装重点考虑三个问题：

1、连接状态

2、心跳检测

3、断线重连

### 连接状态

WebSocket 返回的连接状态有 4 种：

0、`WebSocket.CONNECTING` 正在连接中

1、`WebSocket.OPEN`  已经连接并且可以通讯

2、`WebSocket.CLOSING` 连接正在关闭

3、`WebSocket.CLOSED`  连接已关闭或者没有连接成功

但是这些状态是只读的，无法自由控制修改。对于我们的应用，使用自定义的连接状态，能更好的控制 UI 显示。我们可以仿照着自定义状态：

```javascript
export const SocketStatus = {
  Connecting: '正在连接...', //表示正在连接，这是初始状态。
  Connected: '连接已建立', //表示连接已经建立。
  Disconnecting: '连接正在关闭', //表示连接正在关闭。
  Disconnected: '连接已断开' //表示连接已经关闭
}
```

本篇的封装基于 **Vue3**，下面定义一个组合式函数 **useWebSocket**：

```javascript
// useWebSocket.js
import { ref } from 'vue'

const DEFAULT_OPTIONS = {
  url: '', // websocket url
  heartBeatData: '', // 你的心跳数据
  heartBeatInterval: 60 * 1000, // 心跳间隔，单位ms
  reconnectInterval: 5 * 1000, // 断线重连间隔，单位ms
  maxReconnectAttempts: 10 // 最大重连次数
}

export default function useWebSocket(options = {}) {
  const state = {
     options: { ...DEFAULT_OPTIONS, ...options },
     socket: null,
  }
  
  // 连接状态
  const status = ref(SocketStatus.Disconnected)
}
```

函数 useWebSocket 的参数 options 是一个配置项，对象 state 保存了这个配置， 默认定义了一些配置。

接着，我们可以定义连接和断开方法了：

```javascript
// useWebSocket(options) {...}

const SocketCloseCode = 1000

// 连接状态
const status = ref(SocketStatus.Disconnected)

// 连接
const connect = () => {
	disconnect()

  status.value = SocketStatus.Connecting
  
  state.socket = new WebSocket(state.options.url)

  state.socket.onopen = (openEvent) => {
    console.log('socket连接:', openEvent)
    status.value = SocketStatus.Connected
  }

  state.socket.onmessage = (msgEvent) => {
    console.log('socket消息:', msgEvent)
  }

  state.socket.onclose = (closeEvent) => {
    console.log('socket关闭:', closeEvent)
    status.value = SocketStatus.Disconnected
  }

  state.socket.onerror = (errEvent) => {
    console.log('socket报错:', errEvent)
    status.value = SocketStatus.Disconnected
  }
}

// 断开
const disconnect = () => {
  if (state.socket && (state.socket.OPEN || state.socket.CONNECTING)) {
    console.log('socket断开连接')
    status.value = SocketStatus.Disconnecting
    state.socket.onmessage = null
    state.socket.onerror = null
    state.socket.onclose = null
    // 发送关闭帧给服务端
    state.socket.close(SocketCloseCode, 'normal closure')
    status.value = SocketStatus.Disconnected
    state.socket = null
  }
}
```

到此，我们的连接状态几乎是完成了。



### 心跳检测

心跳的设计需要两个定时器：

一个用于定时发送心跳消息，一个用于对心跳超时处理。

```javascript
const state = {
	// ...
  heartBetaSendTimer: null, // 心跳发送定时器
	heartBetaTimeoutTimer: null // 心跳超时定时器
}

const startHeartBeat = () => {
  stopHeartBeat()
  onHeartBeat(() => {
    if (status.value === SocketStatus.Connected) {
      state.socket.send(state.options.heartBeatData)
      console.log('socket心跳发送:', state.options.heartBeatData)
    }
  })
}

const onHeartBeat = (callback) => {
  state.heartBetaSendTimer = setTimeout(() => {
    callback && callback()
    state.heartBetaTimeoutTimer = setTimeout(() => {
      // 心跳超时,直接关闭socket,抛出自定义code=4444, onclose里进行重连
      state.socket.close(4444, 'heart timeout')
    }, state.options.heartBeatInterval)
  }, state.options.heartBeatInterval)
}

const stopHeartBeat = () => {
  state.heartBetaSendTimer && clearTimeout(state.heartBetaSendTimer)
  state.heartBetaTimeoutTimer && clearTimeout(state.heartBetaTimeoutTimer)
}
```

在 WebSocket 连接成功 和 收到消息时都去尝试开启心跳，断开连接时，停止心跳。

```javascript
const connect = () => {
  state.socket.onopen = (openEvent) => {
    // ...
    startHeartBeat()
  }

  state.socket.onmessage = (msgEvent) => {
 		// 收到任何数据，重新开始心跳
	  startHeartBeat()
    //...
  }
}
  
const disconnect = () => {
  // 连接断开了，同时停止心跳
  stopReconnect()
}
```

可以看到，我们并没有使用 `setInterval()` 方法每隔多少秒去发送一次心跳。而是在收到消息时，先停止之前的心跳计时，再重新开启新的心跳计时。这样可以避免很多无效的心跳发送，而心跳超时后，我们直接关闭了 WebSocket，重连操作放到 **onclose **处理。

### 断线重连

```javascript
const state = {
  //...
  reconnectAttempts: 0, 
  reconnectTimeout: null,
}

const connect = () => {
  //...
  state.socket.onclose = (closeEvent) => {
    //...
    // 非正常关闭,尝试重连
    if (closeEvent.code !== SocketCloseCode) {
      reconnect()
    }
  }

  state.socket.onerror = (errEvent) => {
    // 连接失败，尝试重连
    reconnect()
  }
}

const disconnect = () => {
  //...
  stopReconnect()
}

// 重连方法
const reconnect = () => {
  if (status.value === SocketStatus.Connected || status.value === SocketStatus.Connecting) {
    return
  }
  stopHeartBeat()
  if (state.reconnectAttempts < state.options.maxReconnectAttempts) {
    console.log('socket重连:', state.reconnectAttempts)

    // 重连间隔，5秒起步，下次递增1秒
    const interval = Math.max(state.options.reconnectInterval, state.reconnectAttempts * 1000)
    console.log('间隔时间：', interval)
    state.reconnectTimeout = setTimeout(() => {
      if (status.value !== SocketStatus.Connected && status.value !== SocketStatus.Connecting) {
        connect()
      }
    }, interval)
    state.reconnectAttempts += 1
  } else {
    status.value = SocketStatus.Disconnected
    stopReconnect()
  }
}

// 停止重连
const stopReconnect = () => {
  state.reconnectTimeout && clearTimeout(state.reconnectTimeout)
}
```

在监听到是非正常断开或者连接报错时，进行重连操作。

重连次数达到最大次数时，停止重连。

重连间隔每次比上一次多加1秒。



### 如何使用 useWebSocket.js

比如我们可以写一个辅助函数：useSocket.

通过 watch 去监听 status, message。

调用 connect, disconnect 来实现连接与断开

```javascript
import { ref, watchEffect, watch } from 'vue'
import useWebSocket, { SocketStatus } from './useWebSocket'
import { useAdminStore } from '@stores/adminStore'

export default function useSocket() {
  const { status, message, error, connect, disconnect } = useWebSocket({
    url: 'your webosckt url',
    heartBeatData: 'your heart data'
  })

  const { isLogin } = storeToRefs(useAdminStore())
  const chatMessage = ref(null)
  const socketStatusText = ref('')

  window.addEventListener('offline', function () {
    console.log('网络连接已断开')
  })

  window.addEventListener('online', function () {
    console.log('网络连接已恢复')
    // 在网络连接恢复后执行的操作
    retryConnect()
  })

  watch(() => status.value, (newVal) => {
      if (newVal != SocketStatus.Connected) {
        socketStatusText.value = newVal
      }
    }
  )

  watch(() => message.value, (newVal) => {
      if (newVal) {
         chatMessage.value = newVal
      }
    }
  )

  watchEffect(() => {
    if (isLogin.value) {
      connect()
    } else {
      disconnect()
    }
  })

  const retryConnect = () => {
    if (status.value !== SocketStatus.Connected) {
      connect()
    }
  }

  return {
    socketStatusText,
    chatMessage,
    retryConnect
  }
}

```

在 main.js 中将 useSocket 注入到 provide 中

```javascript
// main.js
const app = createApp(App)
const socket = useSocket()
app.provide('useSocket', socket) // 将 WebSocket 对象注入到应用程序的 provide 中
```

页面里使用：

```javascript
const useSocket = inject('useSocket')

watch(() => useSocket.chatMessage.value, (msg) => {
  console.log(msg)
})
```