import useConfirmationStore from '../store/confirmationStore'

export const useConfirmation = () => {
  const { show } = useConfirmationStore()
  return show
}

