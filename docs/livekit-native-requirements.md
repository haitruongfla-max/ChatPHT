# Yêu cầu native LiveKit cho ChatPHT

Nguồn: `node_modules/@livekit/react-native-expo-plugin/README.md` và `node_modules/@livekit/react-native/README.md`.

- Với dự án Expo managed, LiveKit yêu cầu đồng thời hai config plugin: `@livekit/react-native-expo-plugin` và `@config-plugins/react-native-webrtc`.
- Plugin LiveKit Android nên dùng `audioType: "communication"` cho cuộc gọi hai chiều.
- Ứng dụng native phải gọi `registerGlobals()` trước khi dùng LiveKit; plugin phải được áp dụng vào một bản build Android mới để các thay đổi native có hiệu lực.
- Quyền Android cần thiết cho gọi video gồm `CAMERA`, `RECORD_AUDIO` và `MODIFY_AUDIO_SETTINGS`.

Các yêu cầu này dùng để rà soát nguyên nhân media camera/micro không hoạt động dù kết nối phòng gọi thành công.
