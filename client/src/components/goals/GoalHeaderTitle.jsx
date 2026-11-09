import PanningText from '../atoms/PanningText';
import styles from './GoalHeader.module.css';

/** One copy of the full name stays accessible while its visual pans within the header. */
export default function GoalHeaderTitle({ name }) {
    return <PanningText className={styles.title} title={name} restartKey={name}>{name}</PanningText>;
}
