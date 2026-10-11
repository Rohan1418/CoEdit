import { useState, useEffect, useRef, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

/**
 * Custom React Hook for WebRTC Peer-to-Peer Voice Calling.
 * Handles:
 * - Local audio stream capture (`getUserMedia`)
 * - Web Audio API real-time microphone volume detection
 * - Socket.IO WebRTC signaling (SDP offer, answer, and ICE candidate exchange)
 * - Remote audio streams and multi-peer synchronization
 * - Mute, unmute, speaking activity, and cleanup
 */
export function useWebRTC({ socket, roomId, currentUser, isSimulated = false }) {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [peers, setPeers] = useState(new Map());
  const [error, setError] = useState(null);

  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const remoteAudioElementsRef = useRef(new Map());

  // Cleanup helper for a single remote peer
  const removePeer = useCallback((peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    const audioEl = remoteAudioElementsRef.current.get(peerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      remoteAudioElementsRef.current.delete(peerId);
    }
    setPeers((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  // Web Audio API volume detection loop
  const startVolumeAnalysis = useCallback((stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkAudioLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setLocalVolume(normalized);

        const speakingNow = normalized > 12;
        setIsSpeaking(speakingNow);

        if (socket && socket.connected) {
          socket.emit('voice_mute_toggle', {
            room_id: roomId,
            is_muted: isMuted,
            is_speaking: speakingNow
          });
        }

        animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
      };

      checkAudioLevel();
    } catch (err) {
      console.warn('AudioContext volume analysis initialization error:', err);
    }
  }, [socket, roomId, isMuted]);

  // Create an RTCPeerConnection to a target peer
  const createPeerConnection = useCallback((targetSid, targetUserId, targetName) => {
    if (peerConnectionsRef.current.has(targetSid)) {
      return peerConnectionsRef.current.get(targetSid);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(targetSid, pc);

    // Attach local audio track
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Exchange ICE candidates through Python Socket.IO server
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        socket.emit('webrtc_ice_candidate', {
          target_sid: targetSid,
          target_user_id: targetUserId,
          candidate: event.candidate,
          sender_id: currentUser?.id
        });
      }
    };

    // Receive remote audio stream from peer
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      let audioEl = remoteAudioElementsRef.current.get(targetSid);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
        remoteAudioElementsRef.current.set(targetSid, audioEl);
      }
      audioEl.srcObject = remoteStream;

      setPeers((prev) => {
        const next = new Map(prev);
        next.set(targetSid, {
          user_id: targetUserId,
          username: targetName,
          sid: targetSid,
          is_muted: false,
          is_speaking: false,
          stream: remoteStream
        });
        return next;
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(targetSid);
      }
    };

    return pc;
  }, [socket, currentUser?.id, removePeer]);

  // Join Voice Channel
  const joinVoice = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      localStreamRef.current = stream;
      setIsInVoice(true);
      setIsMuted(false);
      startVolumeAnalysis(stream);

      if (socket && socket.connected) {
        socket.emit('voice_join', {
          room_id: roomId,
          is_muted: false
        }, async (response) => {
          if (response?.existing_voice_peers) {
            for (const peer of response.existing_voice_peers) {
              const pc = createPeerConnection(peer.sid, peer.user_id, peer.username);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);

              socket.emit('webrtc_offer', {
                target_sid: peer.sid,
                target_user_id: peer.user_id,
                sender_id: currentUser?.id,
                sender_name: currentUser?.username,
                offer: offer
              });
            }
          }
        });
      }
    } catch (err) {
      console.error('Failed to access microphone:', err);
      setError(err?.message || 'Microphone access denied');
      setIsInVoice(false);
    }
  }, [socket, roomId, currentUser, startVolumeAnalysis, createPeerConnection]);

  // Leave Voice Channel
  const leaveVoice = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    remoteAudioElementsRef.current.forEach((el) => {
      el.srcObject = null;
      el.remove();
    });
    remoteAudioElementsRef.current.clear();

    setPeers(new Map());
    setIsInVoice(false);
    setIsSpeaking(false);
    setLocalVolume(0);

    if (socket && socket.connected) {
      socket.emit('voice_leave', { room_id: roomId });
    }
  }, [socket, roomId]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = !isMuted;
      audioTrack.enabled = !nextMuted;
      setIsMuted(nextMuted);

      if (socket && socket.connected) {
        socket.emit('voice_mute_toggle', {
          room_id: roomId,
          is_muted: nextMuted,
          is_speaking: false
        });
      }
    }
  }, [isMuted, socket, roomId]);

  // Socket signaling event listeners
  useEffect(() => {
    if (!socket) return;

    const handlePeerJoinedVoice = (data) => {
      if (isInVoice) {
        createPeerConnection(data.sid, data.user_id, data.username);
      }
    };

    const handlePeerLeftVoice = (data) => {
      removePeer(data.sid);
    };

    const handleWebRTCOffer = async (data) => {
      if (!isInVoice) return;
      try {
        const pc = createPeerConnection(data.caller_sid, data.caller_user_id, data.caller_name);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc_answer', {
          target_sid: data.caller_sid,
          target_user_id: data.caller_user_id,
          sender_id: currentUser?.id,
          answer: answer
        });
      } catch (e) {
        console.error('Error handling WebRTC offer:', e);
      }
    };

    const handleWebRTCAnswer = async (data) => {
      const pc = peerConnectionsRef.current.get(data.responder_sid);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
          console.error('Error handling WebRTC answer:', e);
        }
      }
    };

    const handleWebRTCIceCandidate = async (data) => {
      const pc = peerConnectionsRef.current.get(data.sender_sid);
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    };

    const handlePeerVoiceStatus = (data) => {
      setPeers((prev) => {
        const peer = prev.get(data.sid);
        if (!peer) return prev;
        const next = new Map(prev);
        next.set(data.sid, {
          ...peer,
          is_muted: data.is_muted,
          is_speaking: data.is_speaking
        });
        return next;
      });
    };

    socket.on('peer_joined_voice', handlePeerJoinedVoice);
    socket.on('peer_left_voice', handlePeerLeftVoice);
    socket.on('webrtc_offer', handleWebRTCOffer);
    socket.on('webrtc_answer', handleWebRTCAnswer);
    socket.on('webrtc_ice_candidate', handleWebRTCIceCandidate);
    socket.on('peer_voice_status', handlePeerVoiceStatus);

    return () => {
      socket.off('peer_joined_voice', handlePeerJoinedVoice);
      socket.off('peer_left_voice', handlePeerLeftVoice);
      socket.off('webrtc_offer', handleWebRTCOffer);
      socket.off('webrtc_answer', handleWebRTCAnswer);
      socket.off('webrtc_ice_candidate', handleWebRTCIceCandidate);
      socket.off('peer_voice_status', handlePeerVoiceStatus);
    };
  }, [socket, isInVoice, currentUser?.id, createPeerConnection, removePeer]);

  useEffect(() => {
    return () => {
      leaveVoice();
    };
  }, [leaveVoice]);

  return {
    isInVoice,
    isMuted,
    isSpeaking,
    localVolume,
    peers: Array.from(peers.values()),
    error,
    joinVoice,
    leaveVoice,
    toggleMute
  };
}
