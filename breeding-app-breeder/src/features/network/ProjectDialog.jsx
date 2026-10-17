import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeSexValue } from '../animals/animalSex.js';
import { networkApi, errorText } from './networkApi.js';
import { personName, projectAnimals } from './networkFormat.js';
import { AnimalSelect, ErrorNote, NetworkDialog, PersonPicker } from './NetworkBits.jsx';

/**
 * Inviting another breeder to a joint project. You bring a male or a female; they bring the
 * other. Whoever keeps the female through her cycle incubates the eggs, and the dialog says
 * which of you that will be before you send it.
 */
export default function ProjectDialog({ animals, presetAnimalId = '', presetPerson = null, onClose, onDone }) {
  const { t } = useTranslation();
  const titleId = useId();
  const noteId = useId();
  const options = useMemo(() => projectAnimals(animals), [animals]);
  const [person, setPerson] = useState(presetPerson);
  const [animalId, setAnimalId] = useState(options.some((a) => a.id === presetAnimalId) ? presetAnimalId : '');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const animal = options.find((a) => a.id === animalId) || null;
  const sex = animal ? normalizeSexValue(animal.sex) : null;
  const other = person ? personName(person) : t('network.project.theOther', { defaultValue: 'the other breeder' });

  const submit = async () => {
    if (!person || !animal) return;
    setBusy(true);
    setError('');
    try {
      const res = await networkApi.proposeProject({ handle: person.handle, appAnimalId: animal.id, title: title.trim() || undefined, note: note.trim() || undefined });
      onDone?.(res?.project || null);
    } catch (err) {
      setError(errorText(err, t('network.project.failed', { defaultValue: 'The invitation could not be sent.' })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <NetworkDialog
      title={t('network.project.newTitle', { defaultValue: 'Start a joint project' })}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="bn-btn bn-btn--ghost" onClick={onClose}>{t('network.cancel', { defaultValue: 'Cancel' })}</button>
          <button type="button" className="bn-btn bn-btn--primary" onClick={submit} disabled={!person || !animal || busy}>
            {busy ? t('network.sending', { defaultValue: 'Sending…' }) : t('network.project.invite', { defaultValue: 'Send invitation' })}
          </button>
        </>
      )}
    >
      <p className="bn-note">
        {t('network.project.explain', {
          defaultValue: 'Two breeders, one pairing. One brings the male, the other the female. Whoever keeps the female through her cycle incubates the eggs, and you agree the split of the clutch together in the project conversation.',
        })}
      </p>
      <PersonPicker value={person} onPick={setPerson} label={t('network.project.with', { defaultValue: 'With' })} />
      <AnimalSelect
        animals={options}
        value={animalId}
        onChange={setAnimalId}
        label={t('network.project.yourAnimal', { defaultValue: 'The animal you bring' })}
        emptyText={t('network.project.noAnimals', { defaultValue: 'You need a sexed male or female in your collection.' })}
        hint={sex === 'M'
          ? t('network.project.youBringMale', { defaultValue: '{{other}} brings the female, keeps her and incubates. A read-only partner record of your male goes to their collection for the breeding card.', other })
          : sex === 'F'
            ? t('network.project.youBringFemale', { defaultValue: 'You keep your female and incubate. {{other}} brings the male; a read-only partner record of him comes to your collection for the breeding card.', other })
            : null}
      />
      <div className="bn-field">
        <label htmlFor={titleId}>{t('network.project.titleLabel', { defaultValue: 'Project name (optional)' })}</label>
        <input id={titleId} className="bn-input" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder={animal ? `${animal.name || animal.id} project` : ''} />
      </div>
      <div className="bn-field">
        <label htmlFor={noteId}>{t('network.project.note', { defaultValue: 'Message (optional)' })}</label>
        <textarea id={noteId} className="bn-input" rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <ErrorNote error={error} />
    </NetworkDialog>
  );
}
