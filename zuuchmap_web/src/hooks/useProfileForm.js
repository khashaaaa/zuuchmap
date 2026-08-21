import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usersApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import { toast } from 'sonner'
import { apiErrorMessage } from '@/lib/utils'

export function useProfileForm() {
  const { t } = useTranslation()
  const { user, logout, setUser } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [form, setForm] = useState({ given_name: '', parent_name: '', email: '', address: '' })
  const [avatar, setAvatar] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!avatar) return setAvatarUrl(null)
    const url = URL.createObjectURL(avatar)
    setAvatarUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [avatar])

  const { data: profile, isLoading: profileLoading, isError: profileError, refetch: refetchProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: usersApi.getProfile,
  })

  useEffect(() => {
    const src = profile ?? user
    if (src) setForm({
      given_name: src.given_name ?? '',
      parent_name: src.parent_name ?? '',
      email: src.email ?? '',
      address: src.address ?? '',
    })
  }, [profile, user])

  const mut = useMutation({
    mutationFn: (fd) => usersApi.update(user.id, fd),
    onSuccess: (updated) => {
      setUser({ ...user, ...updated })
      qc.setQueryData(['profile'], (old) => ({ ...old, ...updated }))
      toast.success(t('profile.saveSuccess'))
    },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('profile.saveError'))),
  })

  const deleteMut = useMutation({
    mutationFn: usersApi.deleteAccount,
    onSuccess: () => {
      toast.success(t('accountDeletion.deleted'))
      logout()
      navigate('/login', { replace: true })
    },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('accountDeletion.error'))),
  })

  function handleSubmit(e) {
    e.preventDefault()
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v) })
    if (avatar) fd.append('profile_picture', avatar)
    mut.mutate(fd)
  }

  return {
    form, setForm,
    avatar, setAvatar, avatarUrl,
    profile, profileLoading, profileError, refetchProfile,
    src: profile ?? user,
    mut, deleteMut,
    handleSubmit,
    confirmDelete, setConfirmDelete,
    user,
  }
}
