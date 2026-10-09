import { KBArticle } from '../types';

export const KNOWLEDGE_BASE: KBArticle[] = [
  {
    id: 'KB-IT-504',
    title: 'HTTP 504 Gateway Timeout - Upstream Ingress Exhaustion',
    category: 'Networking & Gateway',
    errorCodes: ['504', 'GATEWAY_TIMEOUT', 'HTTP 504', '504 Gateway Time-out', 'ERR_HTTP2_PING_FAILED'],
    keywords: ['upstream timeout', 'load balancer', 'alb', 'nginx 504', 'reverse proxy timed out', 'keepalive timeout', 'envoy upstream timeout'],
    severity: 'P1 - CRITICAL',
    summary: 'The reverse proxy or API gateway did not receive a timely response from the backend application tier.',
    rootCause: 'Backend microservice thread pool exhaustion, long-running unindexed DB queries, or hung worker processes exceeding proxy timeout thresholds (default 60s).',
    symptoms: [
      'Customer-facing 504 Gateway Time-out error page',
      'Sudden drop in completed transactions',
      'Ingress controller error logs showing upstream timed out (110: Connection timed out)',
      'Backend CPU or thread count saturated at 95%+'
    ],
    estimatedResolutionMinutes: 12,
    affectedServices: ['API Gateway', 'Ingress ALB', 'Billing / Checkout Core'],
    escalationPath: 'Page On-Call Tier 2 Infrastructure & API Gateway SRE team',
    authoritativeDocUrl: 'https://docs.enterprise-it.internal/sops/networking/gateway-timeouts',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Check Upstream Pod & Target Health',
        action: 'Inspect whether upstream backend instances are failing health checks or failing readiness probes.',
        command: 'kubectl get pods -n production -l app=core-api -o wide',
        expectedOutput: 'Check for non-READY status, high restart counts, or crashing pods.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Inspect Ingress Controller Tail Logs',
        action: 'Stream live ingress controller logs to identify which upstream IP and endpoint is timing out.',
        command: 'kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=100 | grep "504"',
        expectedOutput: 'Look for upstream_response_time > 60.000s.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Emergency HPA Scale-Out or Thread Pool Expansion',
        action: 'Scale out the downstream service replicas to alleviate instant queue congestion while investigating query bottlenecks.',
        command: 'kubectl scale deployment core-api -n production --replicas=15',
        expectedOutput: 'deployment.apps/core-api scaled'
      },
      {
        id: 'step-4',
        stepNumber: 4,
        title: 'Verify Ingress Recovery & Latency Fallback',
        action: 'Execute automated probe across primary ingress endpoint to verify HTTP 200 return code.',
        command: 'curl -I -s -o /dev/null -w "%{http_code} in %{time_total}s\n" https://api.production.internal/healthz',
        expectedOutput: '200 in 0.042s'
      }
    ]
  },
  {
    id: 'KB-IT-137',
    title: 'Kubernetes Pod CrashLoopBackOff (OOMKilled - Exit Code 137)',
    category: 'Kubernetes & Containers',
    errorCodes: ['137', 'OOMKilled', 'exit code 137', 'CrashLoopBackOff', 'Killed process'],
    keywords: ['oom', 'out of memory', 'memory cgroup', 'container terminated', 'cgroup limit exceeded', 'pod crashed'],
    severity: 'P1 - CRITICAL',
    summary: 'The Linux kernel OOM Killer terminated the container process because memory usage exceeded cgroup hard limits.',
    rootCause: 'Application memory leak, unconstrained buffer growth during high volume batch processing, or under-provisioned memory limits in deployment yaml.',
    symptoms: [
      'Pod status shows CrashLoopBackOff with Last State: Terminated Reason: OOMKilled',
      'Container exit code is 137 (128 + SIGKILL 9)',
      'Service intermittent dropouts as replica count fluctuates'
    ],
    estimatedResolutionMinutes: 10,
    affectedServices: ['K8s Worker Nodes', 'App Microservices', 'Async Queue Consumers'],
    escalationPath: 'Page Container Platform Team & App Lead Engineer',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Verify Pod Termination Reason',
        action: 'Run describe on the failing pod to confirm OOMKilled exit code 137 status.',
        command: 'kubectl describe pod -n production <pod-name> | grep -E "Exit Code|Reason|Limits"',
        expectedOutput: 'Reason: OOMKilled | Exit Code: 137'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Inspect Cgroup Memory Limits & Usage Before Crash',
        action: 'Query Prometheus or run top pods to review the memory slope right before SIGKILL was issued.',
        command: 'kubectl top pod -n production --containers',
        expectedOutput: 'Inspect which container is pegged at 100% memory threshold.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Patch Deployment Memory Limits (Interim Mitigation)',
        action: 'Bump container memory limits from 2Gi to 4Gi to stabilize pod availability immediately.',
        command: 'kubectl set resources deployment <deployment-name> -n production -c=<container-name> --limits=memory=4Gi --requests=memory=2Gi',
        warningNote: 'Ensure host nodes have sufficient allocatable memory to prevent node-level eviction.'
      },
      {
        id: 'step-4',
        stepNumber: 4,
        title: 'Trigger Heap Dump for Post-Mortem',
        action: 'If running JVM / Node.js, trigger diagnostic heap snapshot to diagnose leaks.',
        command: 'jcmd 1 GC.heap_dump /tmp/heapdump_oom.hprof'
      }
    ]
  },
  {
    id: 'KB-IT-1205',
    title: 'Database Transaction Lock Wait Timeout & Deadlock (1205 / 40P01)',
    category: 'Database & Storage',
    errorCodes: ['1205', 'ER_LOCK_WAIT_TIMEOUT', '40P01', 'deadlock detected', 'Lock wait timeout exceeded'],
    keywords: ['deadlock', 'lock wait timeout', 'mysql 1205', 'postgres 40P01', 'transactions blocked', 'innodb status', 'row lock'],
    severity: 'P2 - HIGH',
    summary: 'Two or more concurrent database transactions are mutually blocking each other waiting for exclusive row/table locks.',
    rootCause: 'Unordered multi-row updates across concurrent threads, missing secondary indexes causing full table scans during row locking, or long-lived idle in transaction sessions.',
    symptoms: [
      'Error: Lock wait timeout exceeded; try restarting transaction',
      'Spike in active database connections reaching pool ceiling',
      'Database CPU elevated due to lock resolution spinloops'
    ],
    estimatedResolutionMinutes: 15,
    affectedServices: ['PostgreSQL Cluster', 'MySQL Aurora Primary', 'Order Processing Service'],
    escalationPath: 'Escalate to Tier 2 Database Administrators (DBA on-call)',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Identify Blocking Transaction PID & Query',
        action: 'Query active database activity to locate which thread holds the blocking lock.',
        command: 'SELECT pid, now() - xact_start AS duration, query, state FROM pg_stat_activity WHERE state != \'idle\' ORDER BY duration DESC LIMIT 5;',
        expectedOutput: 'Rows showing queries running longer than 30 seconds holding locks.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Safely Terminate Blocking Backend Session',
        action: 'Terminate the oldest blocking backend session to release locks and allow queued traffic to proceed.',
        command: 'SELECT pg_terminate_backend(<BLOCKING_PID>);',
        warningNote: 'Confirm PID belongs to an orphaned or non-critical process before terminating.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Review Deadlock Graph in Engine Logs',
        action: 'Dump the InnoDB or Postgres deadlock log to identify conflicting SQL statements.',
        command: 'SHOW ENGINE INNODB STATUS\\G',
        expectedOutput: 'LATEST DETECTED DEADLOCK section detailing Transaction 1 and Transaction 2 locks.'
      }
    ]
  },
  {
    id: 'KB-IT-CERT',
    title: 'SSL/TLS Certificate Expiry & Handshake Interruption',
    category: 'Auth & Security',
    errorCodes: ['CERT_HAS_EXPIRED', 'SEC_ERROR_EXPIRED_CERTIFICATE', 'SSL_ERROR_EXPIRED_CERT_DATE', 'x509: certificate has expired', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
    keywords: ['ssl expired', 'tls handshake failed', 'cert expired', 'letsencrypt failure', 'x509 certificate', 'certificate validation failed'],
    severity: 'P1 - CRITICAL',
    summary: 'Client connections to domains or API endpoints are rejected due to an expired public or intermediate TLS certificate.',
    rootCause: 'Cert-manager renewal daemon failed, automated Let\'s Encrypt DNS-01 webhook challenge expired, or custom wildcard cert reached 90-day expiration without rotation.',
    symptoms: [
      'End users receive browser red interstitial "Your connection is not private"',
      'Mobile apps and microservices fail with SSL handshake terminated',
      'Curl test fails with (60) SSL certificate problem: certificate has expired'
    ],
    estimatedResolutionMinutes: 15,
    affectedServices: ['Edge CDN (Cloudflare/Fastly)', 'Wildcard Ingress TLS', 'Customer Portal'],
    escalationPath: 'Page Security Operations (SecOps) & Platform Infra Lead',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Check Expiry Date and Issuer Chain',
        action: 'Probe domain using OpenSSL to verify leaf certificate expiry timestamp and intermediate chain.',
        command: 'openssl s_client -servername api.domain.com -connect api.domain.com:443 2>/dev/null | openssl x509 -noout -dates -issuer',
        expectedOutput: 'notAfter date showing past date or expired chain.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Force Re-issuance via Cert-Manager',
        action: 'Trigger manual renewal of K8s cert-manager certificate resource.',
        command: 'cmctl renew <certificate-resource-name> -n production',
        expectedOutput: 'Certificate renewed successfully.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Restart Ingress Pods to Flush TLS Cache',
        action: 'Perform rollout restart of ingress proxy so memory cache loads the renewed TLS secret.',
        command: 'kubectl rollout restart deployment/ingress-nginx-controller -n ingress-nginx',
        expectedOutput: 'deployment.apps/ingress-nginx-controller restarted'
      }
    ]
  },
  {
    id: 'KB-IT-ENOSPC',
    title: 'Storage Volume Saturation (ENOSPC: No Space Left On Device)',
    category: 'Cloud & Infrastructure',
    errorCodes: ['ENOSPC', 'no space left on device', 'disk full', 'write error: no space', 'Inode exhausted', 'error 28'],
    keywords: ['enospc', 'disk full', 'no space left', 'inode 100%', 'ephemeral-storage exceeded', 'root partition 100%'],
    severity: 'P1 - CRITICAL',
    summary: 'The host OS or container ephemeral storage volume reached 100% block utilization or inode table saturation.',
    rootCause: 'Unrotated application log files (/var/log), uncleaned docker image layers, large temporary files generated by failed ETL jobs.',
    symptoms: [
      'Processes crashing on write() system calls with ENOSPC error 28',
      'Database unable to append WAL or binlogs and forcing read-only mode',
      'System systemd journal or syslog stopping logging'
    ],
    estimatedResolutionMinutes: 10,
    affectedServices: ['Host Node Root Volume', 'Kafka Broker Disk', 'Elasticsearch Node'],
    escalationPath: 'Page Systems Engineering / Storage Admin On-Call',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Analyze Disk Utilization & Inode Usage',
        action: 'Check both block storage and inode counts across all mounted filesystems.',
        command: 'df -h && df -i',
        expectedOutput: 'Look for mounts at 100% Use%.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Find Top Disk Space Consuming Directories',
        action: 'Locate files larger than 500MB consuming filesystem storage.',
        command: 'find /var/log /tmp /data -type f -size +500M -exec ls -lh {} + 2>/dev/null | sort -k5,5 -rh | head -n 10',
        expectedOutput: 'Listing of gigantic runaway .log or .tmp files.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Safely Truncate Bloated Log Files',
        action: 'Truncate the bloated file without deleting the file handle (prevents file descriptor hold locks).',
        command: ': > /var/log/application/runaway.log',
        warningNote: 'Do NOT use "rm" if process is running; truncate with ": > filename" or "truncate -s 0".'
      },
      {
        id: 'step-4',
        stepNumber: 4,
        title: 'Prune Unused Container Layers & Builder Cache',
        action: 'Reclaim container runtime disk space.',
        command: 'docker system prune -af --volumes',
        expectedOutput: 'Total reclaimed space: XX GB'
      }
    ]
  },
  {
    id: 'KB-IT-ORA1017',
    title: 'Database Authentication Failure (ORA-01017 / 28P01 / 1045)',
    category: 'Database & Storage',
    errorCodes: ['ORA-01017', '28P01', '1045', 'Access denied for user', 'password authentication failed', 'FATAL: password authentication failed for user'],
    keywords: ['invalid username/password', 'db auth failure', 'pg password authentication failed', 'mysql error 1045', 'vault secret rotated', 'db connection rejected'],
    severity: 'P2 - HIGH',
    summary: 'The client application failed authentication against the database server due to credential mismatch, account lockout, or expired Vault lease.',
    rootCause: 'HashiCorp Vault or AWS Secrets Manager automatically rotated DB password without the app pool restarting, or application config had mismatched credentials after deployment.',
    symptoms: [
      'Application startup fails with ORA-01017: invalid username/password; logon denied',
      'Postgres logs: FATAL: password authentication failed for user "app_service"',
      'Cascading connection pool initialization failure'
    ],
    estimatedResolutionMinutes: 10,
    affectedServices: ['Database Gateway', 'Secrets Manager / Vault', 'Backend Services'],
    escalationPath: 'Notify DBA Team & Security Operations',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Validate Active Secret in Secrets Manager / Vault',
        action: 'Check latest version and timestamp of DB credentials in Vault or AWS Secrets Manager.',
        command: 'vault kv get secret/production/database/credentials',
        expectedOutput: 'Check version number and last_updated timestamp.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Test DB Credential Directly via CLI',
        action: 'Test login using DB client with current credentials from a secure bastion host.',
        command: 'PGPASSWORD=\'secret\' psql -h db.production.internal -U app_service -d core_db -c "SELECT 1;"',
        expectedOutput: '1 if valid, or detailed auth error.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Force App Pods to Reload Synchronized Secret',
        action: 'Trigger restart of pods to consume newly injected mounted secret.',
        command: 'kubectl rollout restart deployment/core-service -n production',
        expectedOutput: 'deployment.apps/core-service restarted'
      }
    ]
  },
  {
    id: 'KB-IT-EADDR',
    title: 'Socket Port Collision (EADDRINUSE: Address already in use)',
    category: 'Application Runtime',
    errorCodes: ['EADDRINUSE', 'Address already in use', 'errno -48', 'port is already allocated'],
    keywords: ['eaddrinuse', 'port collision', 'listen failed', 'port already in use', 'bind failed'],
    severity: 'P3 - MEDIUM',
    summary: 'A new application instance failed to bind to its configured TCP/UDP port because an existing zombie process is already listening on it.',
    rootCause: 'Previous process crashed without releasing socket, failed hot-reload, or duplicate background service started on identical port (e.g. 3000, 8080, 5000).',
    symptoms: [
      'Error: listen EADDRINUSE: address already in use :::3000',
      'Systemd service restarting repeatedly in crash loop'
    ],
    estimatedResolutionMinutes: 5,
    affectedServices: ['Local Web Service', 'Node.js App', 'CI/CD Build Agents'],
    escalationPath: 'Assign to Application Developer or Devops Engineer',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Identify Process Holding the Port',
        action: 'Find process ID (PID) occupying target port.',
        command: 'lsof -i :3000 -t || netstat -ano | findstr :3000',
        expectedOutput: 'Prints the PID holding socket.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Inspect Process Identity',
        action: 'Confirm the process name and command before killing.',
        command: 'ps -p <PID> -o comm=,args=',
        expectedOutput: 'Shows node / python / docker proxy command.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Gracefully Terminate Orphan Process',
        action: 'Send SIGTERM, or SIGKILL if non-responsive.',
        command: 'kill -15 <PID> || kill -9 <PID>',
        expectedOutput: 'Process exited and socket freed.'
      }
    ]
  },
  {
    id: 'KB-IT-DNS',
    title: 'DNS Resolution Failure (NXDOMAIN / EAI_AGAIN / ServFail)',
    category: 'Networking & Gateway',
    errorCodes: ['DNS_PROBE_FINISHED_NXDOMAIN', 'EAI_AGAIN', 'NXDOMAIN', 'getaddrinfo ENOTFOUND', 'Name or service not known', 'SERVFAIL'],
    keywords: ['dns failed', 'nxdomain', 'name resolution', 'eai_again', 'coredns failure', 'resolv.conf'],
    severity: 'P2 - HIGH',
    summary: 'Host or container cannot resolve internal or external domain names into IP addresses.',
    rootCause: 'CoreDNS pod crash, upstream Route53 / BIND zone delegator timeout, or missing ndots configuration causing slow search domain appending.',
    symptoms: [
      'Application log: getaddrinfo ENOTFOUND api.service.internal',
      'Ping fails with: ping: unknown host',
      'CoreDNS metrics show spike in RCODE 2 (SERVFAIL) or RCODE 3 (NXDOMAIN)'
    ],
    estimatedResolutionMinutes: 10,
    affectedServices: ['CoreDNS', 'Internal VPC Route53', 'Kubernetes Cluster DNS'],
    escalationPath: 'Escalate to Network Operations (NetOps) & Cloud Architecture',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Test Direct Query Against Local Resolver and Public Resolver',
        action: 'Dig hostname against cluster resolver and 8.8.8.8.',
        command: 'dig @10.96.0.10 api.service.internal +short +trace',
        expectedOutput: 'Inspect ANSWER SECTION or status header.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Check CoreDNS Deployment Status',
        action: 'Ensure CoreDNS pods are running healthy without CPU throttling.',
        command: 'kubectl get pods -n kube-system -l k8s-app=kube-dns',
        expectedOutput: 'All CoreDNS pods showing Running 1/1.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Validate /etc/resolv.conf Configuration',
        action: 'Inspect nameservers and options ndots in container or host.',
        command: 'cat /etc/resolv.conf',
        expectedOutput: 'options ndots:2 or ndots:5 configuration check.'
      }
    ]
  },
  {
    id: 'KB-IT-IAM',
    title: 'Cloud IAM Unauthorized / Insufficient Privileges (AccessDenied)',
    category: 'Cloud & Infrastructure',
    errorCodes: ['AccessDenied', '403 Forbidden', 'UnauthorizedOperation', 'sts:AssumeRole denied', 'User is not authorized to perform'],
    keywords: ['iam access denied', 'aws 403', 'assume role failed', 's3 access denied', 'insufficient permissions', 'kms decrypt accessdenied'],
    severity: 'P3 - MEDIUM',
    summary: 'The service role or instance profile lacks explicit IAM policy statements to execute the requested cloud API operation.',
    rootCause: 'KMS Key policy missing service principal, SCP (Service Control Policy) blocking region/action, or IAM role boundary restriction.',
    symptoms: [
      'An error occurred (AccessDenied) when calling the PutObject operation',
      'User: arn:aws:sts::123456789012:assumed-role/AppRole is not authorized to perform sts:AssumeRole',
      'S3 bucket access denied with HTTP 403'
    ],
    estimatedResolutionMinutes: 15,
    affectedServices: ['AWS IAM', 'KMS Encryption', 'S3 Storage & SQS'],
    escalationPath: 'Assign to Cloud Security & DevOps IAM Admin',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Decode IAM Authorization Failure Message',
        action: 'If AWS returned an encoded authorization failure message, decode it using STS.',
        command: 'aws sts decode-authorization-message --encoded-message <ENCODED_MESSAGE> --query DecodedMessage --output json',
        expectedOutput: 'Explicit reason showing which policy (Identity, Resource, SCP, Boundary) caused implicit/explicit deny.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Inspect Attached IAM Role Policies',
        action: 'List attached policies and inline policies for the assumed role.',
        command: 'aws iam list-attached-role-policies --role-name <APP_ROLE_NAME>',
        expectedOutput: 'Check if expected policy ARN is attached.'
      },
      {
        id: 'step-3',
        stepNumber: 3,
        title: 'Verify KMS Key Policy Grants',
        action: 'Ensure the KMS CMK used for encryption grants kms:Decrypt and kms:GenerateDataKey to the role.',
        command: 'aws kms get-key-policy --key-id <KEY_ARN> --policy-name default',
        expectedOutput: 'Check Statement containing Principal AWS role ARN.'
      }
    ]
  },
  {
    id: 'KB-IT-CORS',
    title: 'Cross-Origin Resource Sharing (CORS) Header Missing / Blocked',
    category: 'Application Runtime',
    errorCodes: ['CORS error', 'No Access-Control-Allow-Origin', 'CORS preflight failed', 'Origin not allowed by Access-Control-Allow-Origin'],
    keywords: ['cors', 'cross-origin', 'preflight', 'options 403', 'access-control-allow-origin', 'blocked by cors policy'],
    severity: 'P4 - LOW',
    summary: 'The client web browser blocked an API response because the server response lacked matching CORS HTTP headers.',
    rootCause: 'API Gateway or backend middleware does not respond with appropriate Access-Control-Allow-Origin or Access-Control-Allow-Methods for OPTIONS preflight calls.',
    symptoms: [
      'Browser console error: Access to fetch has been blocked by CORS policy',
      'OPTIONS preflight request returning 404 or 403',
      'Web application UI failing to render dynamic data'
    ],
    estimatedResolutionMinutes: 5,
    affectedServices: ['Web Frontend', 'API Gateway', 'Microservices Router'],
    escalationPath: 'Route to Frontend / Backend API Engineers',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        title: 'Simulate Preflight OPTIONS Request via cURL',
        action: 'Send an OPTIONS preflight request with Origin header to inspect response headers.',
        command: 'curl -I -X OPTIONS -H "Origin: https://app.enterprise.com" -H "Access-Control-Request-Method: POST" https://api.enterprise.com/v1/orders',
        expectedOutput: 'Check for Access-Control-Allow-Origin: https://app.enterprise.com and 200/204 status.'
      },
      {
        id: 'step-2',
        stepNumber: 2,
        title: 'Update Ingress or API Gateway CORS Annotations',
        action: 'Enable CORS headers in NGINX Ingress or FastAPI / Express middleware.',
        command: 'kubectl annotate ingress api-ingress nginx.ingress.kubernetes.io/enable-cors="true" nginx.ingress.kubernetes.io/cors-allow-origin="https://app.enterprise.com" --overwrite',
        expectedOutput: 'ingress.networking.k8s.io/api-ingress annotated'
      }
    ]
  }
];
