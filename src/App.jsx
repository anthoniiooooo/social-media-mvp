import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from './lib/supabase'
import './App.css'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
const MEDIA_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',')
const SUPPORTED_MEDIA_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES])
const STORY_PUBLIC_URL_MARKER = '/object/public/stories/'

const formatDate = (value) => new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))

function getStorageObjectPath(mediaUrl, marker) {
  try {
    const pathname = new URL(mediaUrl).pathname
    const markerIndex = pathname.indexOf(marker)
    if (markerIndex >= 0) return decodeURIComponent(pathname.slice(markerIndex + marker.length))
  } catch {
    try {
      return decodeURIComponent(mediaUrl)
    } catch {
      return mediaUrl
    }
  }
  return mediaUrl
}

function AuthScreen({ onInstall }) {
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))

    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: Capacitor.isNativePlatform()
                ? 'com.seyami.app://login-callback/'
                : `${window.location.origin}/`,
              data: {
                username: String(form.get('username')).trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
                display_name: String(form.get('displayName')).trim(),
              },
            },
          })

      if (result.error) {
        setError(result.error.message)
      } else if (mode === 'signup' && !result.data.session) {
        setNotice('Check your email and confirm your address. You should return to Seyami automatically; if you are not signed in, log in with your new account.')
      }
    } catch (cause) {
      setError(cause.message || 'Authentication could not be completed. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand" href="#" aria-label="Seyami home"><span className="brand-icon">s</span> seyami</a>
        <div className="auth-heading">
          <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <>
            <label>Display name<input name="displayName" autoComplete="name" required maxLength={60} placeholder="Aisha Moore" /></label>
            <label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" placeholder="aishamore" /></label>
          </>}
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required placeholder="At least 6 characters" /></label>
          {error && <p className="form-message error" role="alert">{error}</p>}
          {notice && <p className="form-message success" role="status">{notice}</p>}
          <button className="primary-button full-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? 'New to Seyami?' : 'Already have an account?'}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setNotice('') }}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
        {onInstall && <button className="auth-install" onClick={onInstall}>Install Seyami app</button>}
      </section>
      <aside className="auth-art">
        <div className="art-glow" />
        <div className="art-photo photo-one"><span>☀</span></div>
        <div className="art-photo photo-two"><span>✿</span></div>
      </aside>
    </main>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [posts, setPosts] = useState([])
  const [commentsByPost, setCommentsByPost] = useState({})
  const [loadingCommentsFor, setLoadingCommentsFor] = useState(new Set())
  const [stories, setStories] = useState([])
  const [activeStory, setActiveStory] = useState(null)
  const [tab, setTab] = useState('feed')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [posting, setPosting] = useState(false)
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState([])
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [conversations, setConversations] = useState([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesConversationId, setMessagesConversationId] = useState(null)
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [followingIds, setFollowingIds] = useState(() => new Set())
  const [followStats, setFollowStats] = useState({ followers: 0, following: 0 })
  const [followListMode, setFollowListMode] = useState('')
  const [followList, setFollowList] = useState([])
  const [followListLoading, setFollowListLoading] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const composerRef = useRef(null)
  const postMediaRef = useRef(null)
  const storyMediaRef = useRef(null)
  const authDataEpochRef = useRef(0)
  const currentUser = session?.user

  useEffect(() => {
    const handleInstallAvailable = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    const handleAppInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', handleInstallAvailable)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setAuthLoading(false)
    }).catch((cause) => {
      if (!active) return
      setError(cause.message || 'Could not restore your sign-in session.')
      setAuthLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        authDataEpochRef.current += 1
        setProfile(null)
        setEditingProfile(false)
        setPosts([])
        setCommentsByPost({})
        setLoadingCommentsFor(new Set())
        setStories([])
        setActiveStory(null)
        setConversations([])
        setConversationsLoading(false)
        setSelectedConversation(null)
        setMessages([])
        setMessagesLoading(false)
        setPeople([])
        setNotifications([])
        setFollowingIds(new Set())
        setFollowStats({ followers: 0, following: 0 })
        setFollowListMode('')
        setFollowList([])
        setError('')
        setNotice('')
      }
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const loadProfile = useCallback(async () => {
    if (!currentUser) return
    const epoch = authDataEpochRef.current
    const { data, error: queryError } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle()
    if (queryError) throw queryError
    if (!data) throw new Error('Your profile record is missing from Supabase. No profile data was changed; ask the project administrator to restore the account profile.')
    if (epoch !== authDataEpochRef.current) return
    setProfile(data)
  }, [currentUser])

  const loadPosts = useCallback(async () => {
    if (!currentUser) return
    const epoch = authDataEpochRef.current
    const { data, error: queryError } = await supabase
      .from('posts')
      .select('id,user_id,body,image_url,media_type,created_at,profiles!posts_user_id_fkey(id,username,display_name,avatar_url),likes(user_id)')
      .order('created_at', { ascending: false })
      .limit(40)
    if (queryError) throw queryError
    if (epoch !== authDataEpochRef.current) return
    setPosts((data || []).map((post) => ({
      ...post,
      author: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
      likes: post.likes || [],
      liked: (post.likes || []).some((like) => like.user_id === currentUser.id),
    })))
  }, [currentUser])

  const loadComments = useCallback(async (postId) => {
    if (!currentUser || !postId) return
    const epoch = authDataEpochRef.current
    setLoadingCommentsFor((items) => new Set(items).add(postId))
    try {
      const { data, error: queryError } = await supabase.from('comments')
        .select('id,post_id,user_id,body,created_at,profiles!comments_user_id_fkey(id,username,display_name,avatar_url)')
        .eq('post_id', postId).order('created_at', { ascending: true }).limit(100)
      if (queryError) throw queryError
      if (epoch !== authDataEpochRef.current) return
      setCommentsByPost((items) => ({
        ...items,
        [postId]: (data || []).map((comment) => ({
          ...comment,
          author: Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles,
        })),
      }))
    } finally {
      if (epoch === authDataEpochRef.current) {
        setLoadingCommentsFor((items) => {
          const next = new Set(items)
          next.delete(postId)
          return next
        })
      }
    }
  }, [currentUser])

  const loadNotifications = useCallback(async () => {
    if (!currentUser) return
    const epoch = authDataEpochRef.current
    setNotificationsLoading(true)
    try {
      const { data, error: queryError } = await supabase.from('notifications')
        .select('id,kind,post_id,actor_id,created_at,read_at,profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)')
        .eq('recipient_id', currentUser.id).order('created_at', { ascending: false }).limit(50)
      if (queryError) throw queryError
      if (epoch !== authDataEpochRef.current) return
      setNotifications((data || []).map((notification) => ({
        ...notification,
        actor: Array.isArray(notification.profiles) ? notification.profiles[0] : notification.profiles,
      })))
    } finally {
      if (epoch === authDataEpochRef.current) setNotificationsLoading(false)
    }
  }, [currentUser])

  const loadStories = useCallback(async () => {
    if (!currentUser) return
    const epoch = authDataEpochRef.current
    const { data, error: queryError } = await supabase.from('stories')
      .select('id,user_id,media_url,media_type,created_at,expires_at,profiles(id,username,display_name,avatar_url)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(80)
    if (queryError) throw queryError
    if (epoch !== authDataEpochRef.current) return
    setStories((data || []).map((story) => {
      const author = Array.isArray(story.profiles) ? story.profiles[0] : story.profiles
      return author ? { ...story, media_url: getStorageObjectPath(story.media_url, STORY_PUBLIC_URL_MARKER), author } : null
    }).filter(Boolean))
  }, [currentUser])

  const loadConversations = useCallback(async () => {
    if (!currentUser) return
    const epoch = authDataEpochRef.current
    setConversationsLoading(true)
    try {
      const { data: memberships, error: membershipError } = await supabase
        .from('conversation_participants').select('conversation_id').eq('user_id', currentUser.id)
      if (membershipError) throw membershipError
      const ids = (memberships || []).map((item) => item.conversation_id)
      if (!ids.length) {
        if (epoch === authDataEpochRef.current) setConversations([])
        return
      }
      const [{ data: participants, error: participantError }, { data: recentMessages, error: messageError }] = await Promise.all([
        supabase.from('conversation_participants')
          .select('conversation_id,user_id,profiles(id,username,display_name,avatar_url)')
          .in('conversation_id', ids).neq('user_id', currentUser.id),
        supabase.from('messages').select('id,conversation_id,body,sender_id,created_at')
          .in('conversation_id', ids).order('created_at', { ascending: false }).limit(100),
      ])
      if (participantError) throw participantError
      if (messageError) throw messageError
      if (epoch !== authDataEpochRef.current) return
      const lastByConversation = new Map()
      for (const message of recentMessages || []) {
        if (!lastByConversation.has(message.conversation_id)) lastByConversation.set(message.conversation_id, message)
      }
      setConversations((participants || []).map((item) => ({
        id: item.conversation_id,
        person: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
        lastMessage: lastByConversation.get(item.conversation_id),
      })).filter((item) => item.person))
    } finally {
      if (epoch === authDataEpochRef.current) setConversationsLoading(false)
    }
  }, [currentUser])

  const loadFollowStats = useCallback(async () => {
    if (!currentUser) return
    const epoch = authDataEpochRef.current
    const [{ count: followerCount, error: followersError }, { data: following, count: followingCount, error: followingError }] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', currentUser.id),
      supabase.from('follows').select('following_id', { count: 'exact' }).eq('follower_id', currentUser.id),
    ])
    if (followersError) throw followersError
    if (followingError) throw followingError
    if (epoch !== authDataEpochRef.current) return
    setFollowStats({ followers: followerCount || 0, following: followingCount || 0 })
    setFollowingIds(new Set((following || []).map((item) => item.following_id)))
  }, [currentUser])

  const loadFollowList = async (mode) => {
    if (!currentUser || !['followers', 'following'].includes(mode)) return
    const epoch = authDataEpochRef.current
    setFollowListMode(mode)
    setFollowListLoading(true)
    setError('')
    const column = mode === 'followers' ? 'follower_id' : 'following_id'
    const filterColumn = mode === 'followers' ? 'following_id' : 'follower_id'
    try {
      const { data: relations, error: relationError } = await supabase.from('follows')
        .select(column).eq(filterColumn, currentUser.id).order('created_at', { ascending: false })
      if (relationError) throw relationError
      if (epoch !== authDataEpochRef.current) return
      const ids = (relations || []).map((relation) => relation[column])
      if (!ids.length) {
        setFollowList([])
        return
      }
      const { data: profiles, error: profilesError } = await supabase.from('profiles')
        .select('id,username,display_name,avatar_url').in('id', ids)
      if (profilesError) throw profilesError
      if (epoch !== authDataEpochRef.current) return
      const profilesById = new Map((profiles || []).map((person) => [person.id, person]))
      setFollowList(ids.map((id) => profilesById.get(id)).filter(Boolean))
    } catch (cause) {
      if (epoch === authDataEpochRef.current) setError(cause.message || 'The follow list could not be loaded.')
    } finally {
      if (epoch === authDataEpochRef.current) setFollowListLoading(false)
    }
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    if (!currentUser) return
    const form = new FormData(event.currentTarget)
    const displayName = String(form.get('display_name') || '').trim()
    const username = String(form.get('username') || '').trim().toLowerCase()
    if (!displayName || displayName.length > 60 || !/^[a-z0-9_]{3,32}$/.test(username)) {
      setError('Enter a display name (1–60 characters) and a username (3–32 letters, numbers, or underscores).')
      return
    }
    const avatarUrl = String(form.get('avatar_url') || '').trim()
    if (avatarUrl) {
      try {
        if (new URL(avatarUrl).protocol !== 'https:') throw new Error()
      } catch {
        setError('Avatar URL must be a valid HTTPS URL.')
        return
      }
    }
    setSavingProfile(true)
    setError('')
    try {
      const { data, error: updateError } = await supabase.from('profiles')
        .update({ display_name: displayName, username, avatar_url: avatarUrl || null }).eq('id', currentUser.id)
        .select('id,username,display_name,avatar_url,created_at').maybeSingle()
      if (updateError) throw updateError
      if (!data) throw new Error('Your profile record is missing from Supabase. Your changes were not saved.')
      setProfile(data)
      setEditingProfile(false)
      setNotice('Your profile was updated.')
    } catch (cause) {
      setError(cause.message || 'Your profile could not be updated.')
    } finally {
      setSavingProfile(false)
    }
  }

  const savePost = async (post, body) => {
    if (!currentUser || post.user_id !== currentUser.id) return
    const nextBody = body.trim()
    if (!nextBody && !post.image_url) {
      setError('A post needs a caption or media.')
      return false
    }
    setError('')
    try {
      const { data, error: updateError } = await supabase.from('posts')
        .update({ body: nextBody }).eq('id', post.id).eq('user_id', currentUser.id)
        .select('id').maybeSingle()
      if (updateError) throw updateError
      if (!data) throw new Error('Post not found or you do not have permission to edit it.')
      setPosts((items) => items.map((item) => item.id === post.id ? { ...item, body: nextBody } : item))
      setNotice('Your post was updated.')
      return true
    } catch (cause) {
      setError(cause.message || 'Your post could not be updated.')
      return false
    }
  }

  const deletePost = async (post) => {
    if (!currentUser || post.user_id !== currentUser.id) return
    if (!window.confirm('Delete this post? This also removes its comments and likes.')) return
    setError('')
    try {
      const { data, error: deleteError } = await supabase.from('posts').delete()
        .eq('id', post.id).eq('user_id', currentUser.id).select('id').maybeSingle()
      if (deleteError) throw deleteError
      if (!data) throw new Error('Post not found or you do not have permission to delete it.')
    } catch (cause) {
      setError(cause.message || 'Your post could not be deleted.')
      return
    }
    setPosts((items) => items.filter((item) => item.id !== post.id))
    setCommentsByPost((items) => {
      const next = { ...items }
      delete next[post.id]
      return next
    })
    if (post.image_url) {
      const path = getStorageObjectPath(post.image_url, '/object/public/post-images/')
      try {
        const { error: storageError } = await supabase.storage.from('post-images').remove([path])
        if (storageError) throw storageError
        setNotice('Your post was deleted.')
      } catch (cause) {
        setError(`Post deleted, but its media could not be removed: ${cause.message}`)
      }
    } else {
      setNotice('Your post was deleted.')
    }
  }

  const createComment = async (post, body) => {
    if (!currentUser) return false
    const text = body.trim()
    if (!text || text.length > 2000) return false
    try {
      const { error: insertError } = await supabase.from('comments').insert({
        post_id: post.id, user_id: currentUser.id, body: text,
      })
      if (insertError) throw insertError
      try {
        await loadComments(post.id)
      } catch (cause) {
        setError(`Your comment was posted, but the comments could not be refreshed: ${cause.message}`)
      }
      return true
    } catch (cause) {
      setError(cause.message || 'Your comment could not be posted.')
      return false
    }
  }

  const markNotificationsRead = async () => {
    if (!currentUser) return
    try {
      const { error: rpcError } = await supabase.rpc('mark_notifications_read')
      if (rpcError) throw rpcError
      const readAt = new Date().toISOString()
      setNotifications((items) => items.map((notification) => ({
        ...notification,
        read_at: notification.read_at || readAt,
      })))
    } catch (cause) {
      setError(cause.message || 'Notifications could not be marked as read.')
    }
  }

  useEffect(() => {
    if (!currentUser) return
    let active = true
    Promise.resolve().then(() => active
      ? Promise.all([loadProfile(), loadPosts(), loadStories(), loadConversations(), loadFollowStats(), loadNotifications()])
      : undefined)
      .catch((cause) => { if (active) setError(cause.message || 'Could not load your Seyami account.') })
    return () => { active = false }
  }, [currentUser, loadProfile, loadPosts, loadStories, loadConversations, loadFollowStats, loadNotifications])

  useEffect(() => {
    if (!currentUser) return undefined
    const channel = supabase.channel(`notifications:${currentUser.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${currentUser.id}`,
      }, () => loadNotifications().catch((cause) => setError(cause.message)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser, loadNotifications])

  useEffect(() => {
    if (!selectedConversation) return
    let active = true
    const loadMessages = async () => {
      const { data, error: queryError } = await supabase.from('messages')
        .select('id,conversation_id,body,sender_id,created_at')
        .eq('conversation_id', selectedConversation.id).order('created_at', { ascending: true }).limit(200)
      if (queryError) throw queryError
      if (active) {
        setMessages((items) => {
          const byId = new Map((data || []).map((message) => [message.id, message]))
          for (const message of items) byId.set(message.id, message)
          return [...byId.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(-200)
        })
        setMessagesConversationId(selectedConversation.id)
      }
    }
    loadMessages()
      .catch((cause) => { if (active) setError(cause.message) })
      .finally(() => { if (active) setMessagesLoading(false) })
    const channel = supabase.channel(`messages:${selectedConversation.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${selectedConversation.id}`,
      }, (payload) => setMessages((items) => {
        if (items.some((item) => item.id === payload.new.id)) return items
        return [...items, payload.new].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(-200)
      }))
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [selectedConversation])

  useEffect(() => {
    const query = search.trim().replace(/[%_]/g, '')
    if (tab !== 'explore' || !currentUser || query.length < 2) {
      return
    }
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: queryError } = await supabase.from('profiles')
          .select('id,username,display_name,avatar_url').neq('id', currentUser.id)
          .ilike('username', `%${query}%`).limit(12)
        if (!active) return
        if (queryError) setError(queryError.message)
        else setPeople(data || [])
      } catch (cause) {
        if (active) setError(cause.message || 'People search failed.')
      } finally {
        if (active) setPeopleLoading(false)
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [search, tab, currentUser])

  const createPost = async (event) => {
    event.preventDefault()
    if (!currentUser) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const body = String(form.get('body')).trim()
    const media = form.get('media')
    if (!body && !(media instanceof File && media.size)) {
      setError('Add a caption or choose a photo or video before sharing.')
      return
    }
    setPosting(true)
    setError('')
    setNotice('')
    let mediaUrl = null
    let mediaType = 'image'
    let uploadedPath = null
    let postCreated = false
    try {
      if (media instanceof File && media.size) {
        if (!SUPPORTED_MEDIA_TYPES.has(media.type)) throw new Error('Choose a supported photo or video file.')
        mediaType = VIDEO_TYPES.includes(media.type) ? 'video' : 'image'
        if (media.size > 50 * 1024 * 1024) throw new Error('Media must be smaller than 50 MB.')
        const safeName = media.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`
        uploadedPath = path
        const { error: uploadError } = await supabase.storage.from('post-images').upload(path, media, { contentType: media.type, upsert: false })
        if (uploadError) throw uploadError
        mediaUrl = supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl
      }
      const { error: insertError } = await supabase.from('posts').insert({
        user_id: currentUser.id, body, image_url: mediaUrl, media_type: mediaType,
      })
      if (insertError) throw insertError
      postCreated = true
      formElement.reset()
      setNotice('Your post is live.')
      try {
        await loadPosts()
      } catch (cause) {
        setError(`Your post was created, but the feed could not be refreshed: ${cause.message}`)
      }
    } catch (cause) {
      setError(postCreated
        ? `Your post was created, but the feed could not be refreshed: ${cause.message || 'Try reloading the feed.'}`
        : cause.message || 'Your post could not be shared.')
      if (uploadedPath && !postCreated) {
        try {
          const { error: cleanupError } = await supabase.storage.from('post-images').remove([uploadedPath])
          if (cleanupError) throw cleanupError
        } catch (cleanupCause) {
          setError(`${cause.message || 'Your post could not be shared.'} Uploaded media cleanup also failed: ${cleanupCause.message}`)
        }
      }
    } finally {
      setPosting(false)
    }
  }

  const createStory = async (event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !currentUser) return
    setError('')
    setNotice('')
    let uploadedPath = null
    let storyCreated = false
    try {
      if (!SUPPORTED_MEDIA_TYPES.has(file.type)) throw new Error('Choose a supported photo or video for your story.')
      if (file.size > 50 * 1024 * 1024) throw new Error('Story media must be smaller than 50 MB.')
      const mediaType = VIDEO_TYPES.includes(file.type) ? 'video' : 'image'
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`
      uploadedPath = path
      const { error: uploadError } = await supabase.storage.from('stories').upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError
      const { error: insertError } = await supabase.from('stories').insert({
        user_id: currentUser.id,
        media_url: path,
        media_type: mediaType,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      if (insertError) throw insertError
      storyCreated = true
      setNotice('Your story is live for 24 hours.')
      try {
        await loadStories()
      } catch (cause) {
        setError(`Your story was created, but stories could not be refreshed: ${cause.message}`)
      }
    } catch (cause) {
      let message = storyCreated
        ? `Your story was created, but stories could not be refreshed: ${cause.message || 'Try reloading the feed.'}`
        : cause.message || 'Your story could not be shared.'
      if (uploadedPath && !storyCreated) {
        try {
          const { error: cleanupError } = await supabase.storage.from('stories').remove([uploadedPath])
          if (cleanupError) throw cleanupError
        } catch (cleanupCause) {
          message = `${message} Uploaded story media cleanup also failed: ${cleanupCause.message}`
        }
      }
      setError(message)
    }
  }

  const toggleLike = async (post) => {
    setError('')
    const nextLiked = !post.liked
    try {
      const { error: likeError } = nextLiked
        ? await supabase.from('likes').insert({ post_id: post.id, user_id: currentUser.id })
        : await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', currentUser.id)
      if (likeError) throw likeError
      setPosts((items) => items.map((item) => item.id === post.id
        ? { ...item, liked: nextLiked, likes: nextLiked ? [...item.likes, { user_id: currentUser.id }] : item.likes.filter((like) => like.user_id !== currentUser.id) }
        : item))
    } catch (cause) {
      setError(cause.message || 'Your like could not be updated.')
    }
  }

  const toggleFollow = async (person) => {
    if (!currentUser || person.id === currentUser.id) return
    const wasFollowing = followingIds.has(person.id)
    setError('')
    try {
      const { error: followError } = wasFollowing
        ? await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', person.id)
        : await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: person.id })
      if (followError) throw followError
      setFollowingIds((ids) => {
        const next = new Set(ids)
        if (wasFollowing) next.delete(person.id)
        else next.add(person.id)
        return next
      })
      setFollowStats((stats) => ({ ...stats, following: stats.following + (wasFollowing ? -1 : 1) }))
      if (followListMode) await loadFollowList(followListMode)
    } catch (cause) {
      setError(cause.message || 'Your follow could not be updated.')
    }
  }

  const installApp = async () => {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      setInstallPrompt(null)
    } catch (cause) {
      setError(cause.message || 'Seyami could not be installed from this browser.')
    }
  }

  const openConversation = async (person) => {
    setError('')
    let conversationStarted = false
    try {
      const { data, error: rpcError } = await supabase.rpc('get_or_create_conversation', { other_user_id: person.id })
      if (rpcError) throw rpcError
      const conversation = { id: data, person }
      setMessages([])
      setMessagesConversationId(null)
      setMessagesLoading(true)
      setSelectedConversation(conversation)
      conversationStarted = true
      setTab('messages')
      await loadConversations()
    } catch (cause) {
      if (!conversationStarted) setMessagesLoading(false)
      setError(cause.message || 'The conversation could not be opened.')
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    const body = messageText.trim()
    if (!body || !selectedConversation) return
    setSending(true)
    try {
      const { data, error: insertError } = await supabase.from('messages').insert({
        conversation_id: selectedConversation.id, sender_id: currentUser.id, body,
      }).select('id,conversation_id,sender_id,body,created_at').single()
      if (insertError) throw insertError
      setMessagesConversationId(selectedConversation.id)
      setMessages((items) => items.some((item) => item.id === data.id) ? items : [...items, data])
      setMessageText('')
      loadConversations().catch((cause) => setError(cause.message))
    } catch (cause) {
      setError(cause.message || 'Your message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  if (!supabase) {
    return <main className="setup-page"><section className="setup-card">
      <a className="brand" href="#"><span className="brand-icon">s</span> seyami</a>
      <span className="eyebrow">ONE LAST SETUP STEP</span>
      <h1>Connect your Supabase project.</h1>
      <p>Seyami uses Supabase for accounts, posts, stories, photo and video storage, and messages. Add your project URL and public anon key to a local <code>.env</code> file, then restart Vite.</p>
      <pre>VITE_SUPABASE_URL=https://your-project.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=your-public-anon-key</pre>
      <p>Then run the SQL in <code>supabase/schema.sql</code> in your Supabase SQL Editor. See <code>README.md</code> for the full setup steps. Never use a service-role key in the browser.</p>
    </section></main>
  }
  if (authLoading) return <div className="loading-screen">Loading Seyami…</div>
  if (!currentUser) return <AuthScreen onInstall={installPrompt ? installApp : null} />

  const displayName = profile?.display_name || currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Friend'
  const username = profile?.username || currentUser.user_metadata?.username || currentUser.id.slice(0, 8)
  const avatar = profile?.avatar_url
  const loading = !profile && !error
  const activeMessages = selectedConversation && messagesConversationId === selectedConversation.id
    ? messages.filter((message) => message.conversation_id === selectedConversation.id)
    : []
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length
  const latestStories = [...stories.reduce((byUser, story) => {
    if (!byUser.has(story.user_id)) byUser.set(story.user_id, story)
    return byUser
  }, new Map()).values()]
  const setView = (nextTab) => {
    setTab(nextTab)
    setError('')
    setNotice('')
    setPeopleLoading(nextTab === 'explore' && search.trim().replace(/[%_]/g, '').length >= 2)
    if (nextTab === 'notifications') markNotificationsRead()
  }
  const handleLoadComments = (postId) => loadComments(postId).catch((cause) => setError(cause.message))
  const openComposer = () => {
    setView('feed')
    window.setTimeout(() => postMediaRef.current?.click(), 0)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView('feed') }}><span className="brand-icon">s</span> seyami</a>
        <label className="search-box"><span>⌕</span><input aria-label="Search users" placeholder="Search people by username" value={search} onChange={(event) => {
          const nextSearch = event.target.value
          setSearch(nextSearch)
          setPeople([])
          setPeopleLoading(nextSearch.trim().replace(/[%_]/g, '').length >= 2)
          setTab('explore')
          setError('')
          setNotice('')
        }} /></label>
        <div className="top-actions">
          <button className="icon-button" aria-label="Open messages" onClick={() => setView('messages')}>✉</button>
          <button className="icon-button notification-button" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`} onClick={() => setView('notifications')}>
            <BellIcon />
            {unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
          </button>
          <button className="profile-chip" onClick={() => setView('profile')}>
            <Avatar name={displayName} url={avatar} />
            <span>{displayName}</span>
          </button>
          {installPrompt && <button className="text-button" onClick={installApp}>Install app</button>}
          <button className="text-button" onClick={async () => {
            try {
              const { error: signOutError } = await supabase.auth.signOut()
              if (signOutError) throw signOutError
            } catch (cause) {
              setError(cause.message || 'You could not be signed out.')
            }
          }}>Log out</button>
        </div>
      </header>
      <main className="layout">
        <aside className="sidebar">
          <div className="sidebar-profile">
            <Avatar name={displayName} url={avatar} large />
            <div><strong>{displayName}</strong><span>@{username}</span></div>
          </div>
          <nav className="nav-list" aria-label="Main navigation">
            <NavButton active={tab === 'feed'} onClick={() => setView('feed')} icon="⌂">Home</NavButton>
            <NavButton active={tab === 'reels'} onClick={() => setView('reels')} icon="▣">Reels</NavButton>
            <NavButton active={tab === 'explore'} onClick={() => setView('explore')} icon="⌕">Explore</NavButton>
            <NavButton active={tab === 'messages'} onClick={() => setView('messages')} icon="✉">Messages</NavButton>
            <NavButton active={tab === 'profile'} onClick={() => setView('profile')} icon="◎">My Profile</NavButton>
          </nav>
        </aside>

        <section className="main-content">
          {(error || notice) && <div className={`app-alert ${error ? 'alert-error' : 'alert-success'}`} role={error ? 'alert' : 'status'}>
            <span>{error || notice}</span><button aria-label="Dismiss" onClick={() => { setError(''); setNotice('') }}>×</button>
          </div>}
          {tab === 'feed' && <>
            <section className="stories-strip" aria-label="Stories">
              <button className="story-person story-add" onClick={() => storyMediaRef.current?.click()}>
                <span className="story-avatar-wrap"><Avatar name={displayName} url={avatar} /><span className="story-add-mark">+</span></span>
                <small>Your story</small>
              </button>
              {latestStories.map((story) => (
                <button className="story-person" key={story.user_id} onClick={() => setActiveStory(story)}>
                  <span className="story-avatar-wrap story-ring"><Avatar name={story.author.display_name} url={story.author.avatar_url} /></span>
                  <small>{story.user_id === currentUser.id ? 'You' : story.author.username}</small>
                </button>
              ))}
              <input ref={storyMediaRef} className="visually-hidden" type="file" accept={MEDIA_ACCEPT} onChange={createStory} />
            </section>
            <form className="composer card" onSubmit={createPost}>
              <div className="composer-top"><Avatar name={displayName} url={avatar} /><textarea ref={composerRef} name="body" aria-label="Post caption" maxLength={2000} placeholder="What’s happening in your world?" /></div>
              <div className="composer-bottom"><label className="upload-button">▧ <span>Add photo or video</span><input ref={postMediaRef} name="media" type="file" accept={MEDIA_ACCEPT} /></label><small>Up to 50 MB</small><button className="primary-button" disabled={posting}>{posting ? 'Sharing…' : 'Share post'} <span>↗</span></button></div>
            </form>
            {loading ? <div className="empty-state">Loading your feed…</div> : posts.length ? <div className="post-list">{posts.map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} onLike={() => toggleLike(post)} onSave={savePost} onDelete={deletePost} comments={commentsByPost[post.id]} commentsLoading={loadingCommentsFor.has(post.id)} onLoadComments={handleLoadComments} onCreateComment={(body) => createComment(post, body)} />)}</div> : <div className="empty-state"><span>✳</span><h2>Your feed starts here.</h2><p>Share a photo or find people to follow once they post.</p><button className="secondary-button" onClick={() => setView('explore')}>Find people</button></div>}
          </>}
          {tab === 'reels' && <section className="reels-view"><div className="reels-heading"><h1>Reels</h1></div>
            {posts.filter((post) => post.media_type === 'video').length
              ? <div className="reel-list">{posts.filter((post) => post.media_type === 'video').map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} onLike={() => toggleLike(post)} onSave={savePost} onDelete={deletePost} comments={commentsByPost[post.id]} commentsLoading={loadingCommentsFor.has(post.id)} onLoadComments={handleLoadComments} onCreateComment={(body) => createComment(post, body)} reel />)}</div>
              : <div className="empty-state"><span>▶</span><h2>Reels are waiting for your first video.</h2><p>Choose Create and share a video to see it here.</p><button className="secondary-button" onClick={openComposer}>Create a reel</button></div>}
          </section>}
          {tab === 'explore' && <section className="explore-view"><h1>Explore</h1><p>Search usernames to find people and start a conversation.</p>
            <label className="search-box explore-search"><span>⌕</span><input aria-label="Search usernames" placeholder="Try a username, like aishamore" value={search} onChange={(event) => {
              const nextSearch = event.target.value
              setSearch(nextSearch)
              setPeople([])
              setPeopleLoading(nextSearch.trim().replace(/[%_]/g, '').length >= 2)
              setError('')
            }} /></label>
            {search.trim().length < 2 ? <div className="empty-state"><span>⌕</span><h2>Who are you looking for?</h2><p>Type at least two characters to find people.</p></div> : peopleLoading ? <div className="empty-state">Searching people…</div> : people.length ? <div className="people-list">{people.map((person) => <div className="person-card card" key={person.id}><div className="person-details"><Avatar name={person.display_name} url={person.avatar_url} /><div><strong>{person.display_name}</strong><span>@{person.username}</span></div></div><div className="person-actions"><button className="secondary-button" onClick={() => toggleFollow(person)}>{followingIds.has(person.id) ? 'Following' : 'Follow'}</button><button className="secondary-button" onClick={() => openConversation(person)}>Message</button></div></div>)}</div> : <div className="empty-state"><span>✳</span><h2>No people found yet.</h2><p>Try another username.</p></div>}
          </section>}
          {tab === 'notifications' && <section className="explore-view notifications-view"><h1>Notifications</h1>
            {notificationsLoading ? <div className="empty-state">Loading notifications…</div> : notifications.length
              ? <div className="notification-list">{notifications.map((notification) => <button className={`notification-item card ${notification.read_at ? '' : 'unread'}`} key={notification.id} onClick={() => { if (notification.post_id) setView('feed') }}>
                  <Avatar name={notification.actor?.display_name || 'Seyami member'} url={notification.actor?.avatar_url} />
                  <span><strong>{notification.actor?.display_name || 'A Seyami member'}</strong> {notification.kind === 'like' ? 'liked your post' : notification.kind === 'comment' ? 'commented on your post' : 'started following you'}<small>{new Date(notification.created_at).toLocaleString()}</small></span>
                </button>)}</div>
              : <div className="empty-state"><span>✳</span><h2>You’re all caught up.</h2><p>Likes, comments, and new followers will show up here.</p></div>}
          </section>}
          {tab === 'messages' && <section className="messages-view"><div className="messages-heading"><div><h1>Messages</h1></div><button className="secondary-button" onClick={() => setView('explore')}>Find people</button></div>
            <div className="chat-layout card"><aside className="chat-list"><h2>Your chats</h2>{conversationsLoading ? <p className="chat-empty">Loading conversations…</p> : conversations.length ? conversations.map((item) => <button key={item.id} className={`chat-person ${selectedConversation?.id === item.id ? 'selected' : ''}`} onClick={() => {
              if (selectedConversation?.id !== item.id) {
                setMessages([])
                setMessagesConversationId(null)
                setMessagesLoading(true)
                setSelectedConversation(item)
              }
            }}><Avatar name={item.person.display_name} url={item.person.avatar_url} /><span><strong>{item.person.display_name}</strong><small>{item.lastMessage?.body || `@${item.person.username}`}</small></span></button>) : <p className="chat-empty">No conversations yet. Find someone to say hello.</p>}</aside>
              <div className="chat-window">{selectedConversation ? <>
                <div className="chat-header"><Avatar name={selectedConversation.person.display_name} url={selectedConversation.person.avatar_url} /><div><strong>{selectedConversation.person.display_name}</strong><span>@{selectedConversation.person.username}</span></div></div>
                <div className="message-list">{activeMessages.map((message) => <div key={message.id} className={`message-bubble ${message.sender_id === currentUser.id ? 'mine' : ''}`}><p>{message.body}</p><time>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>)}
                  {!activeMessages.length && <div className="empty-chat"><span>{messagesLoading ? '' : '✳'}</span><p>{messagesLoading ? 'Loading messages…' : 'Say hello and start the conversation.'}</p></div>}
                </div>
                <form className="message-form" onSubmit={sendMessage}><input aria-label="Write a message" value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Write a message…" maxLength={2000} /><button className="primary-button" disabled={sending || !messageText.trim()}>{sending ? 'Sending…' : 'Send ↗'}</button></form>
              </> : <div className="empty-chat"><span>✉</span><h2>Your conversations live here.</h2><p>Choose a chat or find someone new to message.</p></div>}</div>
            </div>
          </section>}
          {tab === 'profile' && <section className="profile-view"><div className="profile-hero card"><Avatar name={displayName} url={avatar} large /><div className="profile-identity"><h1>{displayName}</h1><p>@{username}</p></div><div className="profile-stats"><button onClick={() => loadFollowList('followers')}><strong>{followStats.followers}</strong><span>Followers</span></button><button onClick={() => loadFollowList('following')}><strong>{followStats.following}</strong><span>Following</span></button><button className="secondary-button" onClick={() => setEditingProfile((value) => !value)}>{editingProfile ? 'Cancel' : 'Edit profile'}</button></div></div>
            {editingProfile && <form className="profile-edit card" onSubmit={saveProfile}>
              <label>Display name<input name="display_name" required maxLength={60} defaultValue={displayName} /></label>
              <label>Username<input name="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" defaultValue={username} /></label>
              <label>Avatar URL (HTTPS)<input name="avatar_url" type="url" defaultValue={avatar || ''} placeholder="https://example.com/avatar.jpg" /></label>
              <button className="primary-button" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile'}</button>
            </form>}
            {followListMode && <section className="follow-list card"><div className="follow-list-heading"><h2>{followListMode === 'followers' ? 'Your followers' : 'You follow'}</h2><button className="text-button" onClick={() => setFollowListMode('')}>Close</button></div>
              {followListLoading ? <p className="follow-list-empty">Loading people…</p> : followList.length ? <div className="people-list">{followList.map((person) => <div className="person-card" key={person.id}><div className="person-details"><Avatar name={person.display_name} url={person.avatar_url} /><div><strong>{person.display_name}</strong><span>@{person.username}</span></div></div><button className="secondary-button" onClick={() => toggleFollow(person)}>{followingIds.has(person.id) ? 'Following' : 'Follow'}</button></div>)}</div> : <p className="follow-list-empty">{followListMode === 'followers' ? 'No followers yet. Share a post and invite people to follow you.' : 'You are not following anyone yet. Find people in Explore.'}</p>}
            </section>}
            <h2>Your posts <span>{posts.filter((post) => post.user_id === currentUser.id).length}</span></h2>
            {posts.some((post) => post.user_id === currentUser.id) ? <div className="post-list">{posts.filter((post) => post.user_id === currentUser.id).map((post) => <PostCard key={post.id} post={post} currentUser={currentUser} onLike={() => toggleLike(post)} onSave={savePost} onDelete={deletePost} comments={commentsByPost[post.id]} commentsLoading={loadingCommentsFor.has(post.id)} onLoadComments={handleLoadComments} onCreateComment={(body) => createComment(post, body)} />)}</div> : <div className="empty-state"><span>☀</span><h2>Your story is waiting.</h2><p>Share your first post with your people.</p><button className="secondary-button" onClick={() => setView('feed')}>Create a post</button></div>}
          </section>}
        </section>
      </main>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button className={tab === 'feed' ? 'active' : ''} aria-current={tab === 'feed' ? 'page' : undefined} onClick={() => setView('feed')}><span aria-hidden="true">⌂</span><small>Home</small></button>
        <button className={tab === 'reels' ? 'active' : ''} aria-current={tab === 'reels' ? 'page' : undefined} onClick={() => setView('reels')}><span aria-hidden="true">▣</span><small>Reels</small></button>
        <button className={tab === 'explore' ? 'active' : ''} aria-current={tab === 'explore' ? 'page' : undefined} onClick={() => setView('explore')}><span aria-hidden="true">⌕</span><small>Explore</small></button>
        <button className={tab === 'messages' ? 'active' : ''} aria-current={tab === 'messages' ? 'page' : undefined} onClick={() => setView('messages')}><span aria-hidden="true">✉</span><small>Messages</small></button>
        <button className={tab === 'profile' ? 'active' : ''} aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setView('profile')}><span aria-hidden="true">◎</span><small>My Profile</small></button>
      </nav>
      {activeStory && <StoryViewer key={activeStory.id} story={activeStory} onClose={() => setActiveStory(null)} />}
    </div>
  )
}

function Avatar({ name = '?', url, large = false }) {
  return url
    ? <img className={`avatar ${large ? 'avatar-large' : ''}`} src={url} alt="" />
    : <span className={`avatar ${large ? 'avatar-large' : ''}`} aria-hidden="true">{name?.trim()?.[0]?.toUpperCase() || '?'}</span>
}

function NavButton({ active, onClick, icon, children }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{children}</button>
}

function PostCard({
  post, currentUser, onLike, onSave, onDelete, comments = [], commentsLoading = false,
  onLoadComments, onCreateComment, reel = false,
}) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(post.body)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const author = post.author || {}
  const authorName = author.display_name || 'Seyami member'
  const isOwner = post.user_id === currentUser.id
  const save = async (event) => {
    event.preventDefault()
    if (await onSave(post, editBody)) setEditing(false)
  }
  const submitComment = async (event) => {
    event.preventDefault()
    if (!commentBody.trim()) return
    setCommentSending(true)
    if (await onCreateComment(commentBody)) setCommentBody('')
    setCommentSending(false)
  }
  const toggleComments = () => {
    const opening = !commentsOpen
    setCommentsOpen(opening)
    if (opening) onLoadComments(post.id)
  }
  return <article className={`post-card card ${reel ? 'reel-card' : ''}`}>
    <div className="post-header"><div className="person-details"><Avatar name={authorName} url={author.avatar_url} /><div><strong>{authorName}</strong><span>@{author.username || 'member'} · {formatDate(post.created_at)}</span></div></div>
      {isOwner && <div className="post-owner-actions"><span className="own-post">Your post</span><button className="text-button" onClick={() => { setEditBody(post.body); setEditing((value) => !value) }}>{editing ? 'Cancel' : 'Edit'}</button><button className="text-button" onClick={() => onDelete(post)}>Delete</button></div>}
    </div>
    {editing
      ? <form className="post-edit-form" onSubmit={save}><textarea aria-label="Edit post caption" value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={2000} /><button className="primary-button">Save changes</button></form>
      : post.body && <p className="post-text">{post.body}</p>}
    {post.image_url && (post.media_type === 'video'
      ? <video className="post-image post-video" src={post.image_url} controls playsInline preload="metadata" />
      : <img className="post-image" src={post.image_url} alt={post.body ? `Photo shared by ${authorName}` : `Photo shared by ${authorName}`} loading="lazy" />)}
    <div className="post-actions"><button className={`action-button ${post.liked ? 'liked' : ''}`} onClick={onLike} aria-label={`${post.liked ? 'Unlike' : 'Like'} post`}>
      <span>{post.liked ? '♥' : '♡'}</span> {post.likes.length.toLocaleString()} {post.likes.length === 1 ? 'like' : 'likes'}
    </button><button className="action-button" onClick={toggleComments} aria-expanded={commentsOpen}>Comments</button><span className="post-date">{new Date(post.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></div>
    {commentsOpen && <section className="comment-panel" aria-label="Post comments">
      {commentsLoading ? <p className="comment-empty">Loading comments…</p> : comments.length ? <div className="comment-list">{comments.map((comment) => <p key={comment.id}><strong>{comment.author?.display_name || 'Seyami member'}</strong> {comment.body}</p>)}</div> : <p className="comment-empty">No comments yet.</p>}
      <form className="comment-form" onSubmit={submitComment}><input aria-label="Write a comment" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Write a comment…" maxLength={2000} /><button className="secondary-button" disabled={commentSending || !commentBody.trim()}>{commentSending ? 'Posting…' : 'Comment'}</button></form>
    </section>}
  </article>
}

function StoryViewer({ story, onClose }) {
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaError, setMediaError] = useState('')

  useEffect(() => {
    let active = true
    let objectUrl
    const expiresAt = new Date(story.expires_at).getTime()
    const expiresIn = expiresAt - Date.now()
    if (expiresIn <= 0) {
      Promise.resolve().then(() => {
        if (active) setMediaError('This story has expired.')
      })
      return () => { active = false }
    }

    const expiryTimer = window.setTimeout(() => {
      if (!active) return
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
      setMediaUrl('')
      setMediaError('This story has expired.')
    }, expiresIn)

    const loadStory = async () => {
      if (Date.now() >= expiresAt) throw new Error('This story has expired.')
      const { data, error: downloadError } = await supabase.storage.from('stories')
        .download(getStorageObjectPath(story.media_url, STORY_PUBLIC_URL_MARKER))
      if (downloadError) throw downloadError
      if (!active) return
      if (Date.now() >= expiresAt) {
        setMediaError('This story has expired.')
        return
      }
      objectUrl = URL.createObjectURL(data)
      setMediaUrl(objectUrl)
    }

    loadStory()
      .catch((cause) => {
        if (active) setMediaError(cause.message || 'This story could not be loaded.')
      })

    return () => {
      active = false
      window.clearTimeout(expiryTimer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [story])

  return <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`${story.author.display_name}'s story`} onClick={onClose}>
    <button className="story-close" aria-label="Close story" onClick={onClose}>×</button>
    <div className="story-viewer-content" onClick={(event) => event.stopPropagation()}>
      <div className="story-viewer-author"><Avatar name={story.author.display_name} url={story.author.avatar_url} /><strong>{story.author.display_name}</strong></div>
      {mediaError ? <p role="alert">{mediaError}</p> : mediaUrl
        ? story.media_type === 'video'
          ? <video src={mediaUrl} autoPlay controls playsInline />
          : <img src={mediaUrl} alt={`${story.author.display_name}'s story`} />
        : <p role="status">Loading story…</p>}
    </div>
  </div>
}

function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

export default App
