import { useState, useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { WebRTCPeer } from '../types';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

interface UseWebRTCOptions {
  socket: Socket | null;
  roomId: string;
  currentUser: { id: string; username: string };
  isSimulated?: boolean;
}

export function useWebRTC({ socket, roomId, currentUser, isSimulated = false }: UseWebRTCOptions) {
  const [isInVoice, setIsInVoice] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [localVolume, setLocalVolume] = useState<number>(0);
  const [peers, setPeers] = useState<Map<string, WebRTCPeer>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Cleanup helper for a specific peer
  const removePeer = useCallback((peerId: string) => {
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

  // Initialize Web Audio API volume detection loop
  const startVolumeAnalysis = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  const createPeerConnection = useCallback((targetSid: string, targetUserId: string, targetName: string) => {
    if (peerConnectionsRef.current.has(targetSid)) {
      return peerConnectionsRef.current.get(targetSid)!;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(targetSid, pc);

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && socket.connected) {
        socket.emit('webrtc_ice_candidate', {
          target_sid: targetSid,
          target_user_id: targetUserId,
          candidate: event.candidate,
          sender_id: currentUser.id
        });
      }
    };

    // Handle incoming remote audio stream
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
  }, [socket, currentUser.id, removePeer]);

  // Join Voice Channel
  const joinVoice = useCallback(async () => {
    try {
      setError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const flagUrl = navigator.userAgent.includes('OPR') ? 'opera://flags' : (navigator.userAgent.includes('Edg') ? 'edge://flags' : 'chrome://flags');
        const errorMsg =
          `Microphone access is blocked on ${window.location.origin} because it is HTTP.\n\n` +
          `To enable WebRTC voice on this laptop over Wi-Fi:\n` +
          `1. Open a new tab and go to: ${flagUrl}/#unsafely-treat-insecure-origin-as-secure\n` +
          `2. Enable the flag\n` +
          `3. Add "${window.location.origin}" in the text box\n` +
          `4. Click Relaunch.`;
        alert(errorMsg);
        throw new Error(errorMsg);
      }
      // Request microphone access
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
        // Emit voice_join to server
        socket.emit('voice_join', {
          room_id: roomId,
          is_muted: false
        }, async (response: { status: string; existing_voice_peers?: Array<{ sid: string; user_id: string; username: string }> }) => {
          if (response?.existing_voice_peers) {
            // As the joiner, initiate offer to each existing member in voice
            for (const peer of response.existing_voice_peers) {
              const pc = createPeerConnection(peer.sid, peer.user_id, peer.username);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);

              socket.emit('webrtc_offer', {
                target_sid: peer.sid,
                target_user_id: peer.user_id,
                sender_id: currentUser.id,
                sender_name: currentUser.username,
                offer: offer
              });
            }
          }
        });
      } else if (isSimulated) {
        // Mock partner in voice for immediate interactive testing
        setTimeout(() => {
          setPeers((prev) => {
            const next = new Map(prev);
            next.set('sim_peer_1', {
              user_id: 'sim_peer_1',
              username: 'Alex (Pair Partner)',
              sid: 'sim_peer_1',
              is_muted: false,
              is_speaking: true
            });
            return next;
          });
        }, 1200);
      }
    } catch (err: unknown) {
      console.error('Failed to access microphone:', err);
      const msg = err instanceof Error ? err.message : 'Microphone permission denied or device unavailable';
      setError(msg);
      setIsInVoice(false);
    }
  }, [socket, roomId, currentUser, startVolumeAnalysis, createPeerConnection, isSimulated]);

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

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    // Clean up audio elements
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

    // A remote peer joined voice channel
    const handlePeerJoinedVoice = (data: { sid: string; user_id: string; username: string }) => {
      if (isInVoice) {
        // Will wait for offer or initiate
        createPeerConnection(data.sid, data.user_id, data.username);
      }
    };

    // A peer left voice channel
    const handlePeerLeftVoice = (data: { sid: string; user_id: string }) => {
      removePeer(data.sid);
    };

    // Received SDP Offer from a peer
    const handleWebRTCOffer = async (data: { caller_sid: string; caller_user_id: string; caller_name: string; offer: RTCSessionDescriptionInit }) => {
      if (!isInVoice) return;
      try {
        const pc = createPeerConnection(data.caller_sid, data.caller_user_id, data.caller_name);
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc_answer', {
          target_sid: data.caller_sid,
          target_user_id: data.caller_user_id,
          sender_id: currentUser.id,
          answer: answer
        });
      } catch (e) {
        console.error('Error handling WebRTC offer:', e);
      }
    };

    // Received SDP Answer from a peer
    const handleWebRTCAnswer = async (data: { responder_sid: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionsRef.current.get(data.responder_sid);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
          console.error('Error handling WebRTC answer:', e);
        }
      }
    };

    // Received ICE Candidate from a peer
    const handleWebRTCIceCandidate = async (data: { sender_sid: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionsRef.current.get(data.sender_sid);
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    };

    // Voice status update (mute / speaking)
    const handlePeerVoiceStatus = (data: { sid: string; is_muted: boolean; is_speaking: boolean }) => {
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
  }, [socket, isInVoice, currentUser.id, createPeerConnection, removePeer]);

  // Clean up on component unmount
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
