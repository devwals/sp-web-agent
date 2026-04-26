import * as React from "react";
import styles from "./Copyright.module.scss";

export default function Copyright(): JSX.Element {
    return (
        <div className={styles.container}>
            <p className={styles.information}>
                This web part is powered by Microsoft Azure AI and is designed to assist with document uploads and related queries.
            </p>
            <p className={styles.information}>© 2025 Prashant Devkota. </p>
            <p className={styles.information}>
                👤
                <a
                    href="https://www.linkedin.com/in/prashant-devkota-212a485"
                    target="_blank"
                    rel="noreferrer"
                >
                    LinkedIn
                </a>
            </p>
            <p className={styles.information}>
                📧{" "}
                <a href="mailto:prashant@devwals.com">
                    Click to send email
                </a>{" "}
                for customisations or any questions that you may have.
            </p>
        </div>
    );
}