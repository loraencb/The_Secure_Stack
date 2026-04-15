import { Fragment } from "react";

function getNodeTone(role = "") {
  const normalizedRole = String(role).toLowerCase();

  if (normalizedRole.includes("attacker")) {
    return "sky";
  }

  if (normalizedRole.includes("target")) {
    return "danger";
  }

  return "info";
}

export default function LabTopologyCard({ topology }) {
  if (!topology?.nodes?.length) {
    return null;
  }

  return (
    <div className="detail-box topology-card">
      <span className="detail-label">Network Topology</span>
      {topology.summary ? (
        <p className="topology-card__summary">{topology.summary}</p>
      ) : null}

      <div className="topology-map" aria-label="Lab topology map">
        {topology.nodes.map((node, index) => (
          <Fragment key={node.id || node.label || index}>
            {index > 0 ? (
              <div className="topology-map__connector" aria-hidden="true">
                <span />
              </div>
            ) : null}

            <article
              className={`topology-node topology-node--${getNodeTone(
                node.role || node.kind
              )}`}
            >
              <span className="topology-node__eyebrow">
                {node.kind || node.role || "Node"}
              </span>
              <strong>{node.label}</strong>
              {node.details ? <p>{node.details}</p> : null}
            </article>
          </Fragment>
        ))}
      </div>

      {topology.connections?.length ? (
        <ul className="topology-links">
          {topology.connections.map((connection, index) => (
            <li key={`${connection.from}-${connection.to}-${index}`}>
              <strong>{connection.from}</strong>
              <span>{connection.label || "connected to"}</span>
              <strong>{connection.to}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
