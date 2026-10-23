import { LogFile } from './logParser';

export const demoFiles: LogFile[] = [
  {
    name: 'app-2026-10-22.log',
    size: 3365523,
    lastModified: '2026-10-22 16:09',
    content: `2026-10-22 08:00:01.123 [main] INFO  c.e.Application - Starting Application v2.4.1 on prod-server-01 with PID 15234
2026-10-22 08:00:01.456 [main] INFO  c.e.Application - Active profile: production
2026-10-22 08:00:02.789 [main] INFO  o.s.b.w.e.t.TomcatWebServer - Tomcat initialized with port(s): 8080 (http)
2026-10-22 08:00:03.012 [main] INFO  o.s.o.j.LocalContainerEntityManagerFactoryBean - Initializing JPA entity manager factory
2026-10-22 08:00:04.234 [main] INFO  c.z.h.HikariDataSource - HikariPool-1 - Starting...
2026-10-22 08:00:04.567 [main] INFO  c.z.h.HikariDataSource - HikariPool-1 - Start completed.
2026-10-22 08:00:05.890 [main] INFO  o.s.b.w.e.t.TomcatWebServer - Tomcat started on port(s): 8080 (http) with context path ''
2026-10-22 08:00:05.891 [main] INFO  c.e.Application - Started Application in 4.768 seconds (JVM running for 5.234)
2026-10-22 08:15:23.456 [http-nio-8080-exec-1] INFO  c.e.c.AssemblyController - Processing assembly request: id=ASB-2026-1042
2026-10-22 08:15:23.789 [http-nio-8080-exec-1] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database
2026-10-22 08:15:24.012 [http-nio-8080-exec-1] DEBUG c.e.s.AssemblyService - Found 12 components for assembly ASB-2026-1042
2026-10-22 08:15:24.345 [http-nio-8080-exec-1] INFO  c.e.s.AssemblyService - Assembly validation started for ASB-2026-1042
2026-10-22 08:15:25.678 [http-nio-8080-exec-1] WARN  c.e.s.AssemblyService - Component COMP-007 has deprecated version 1.2.0, latest is 2.0.0
2026-10-22 08:15:25.901 [http-nio-8080-exec-1] WARN  c.e.s.AssemblyService - Component COMP-011 missing optional dependency: lib-utils
2026-10-22 08:15:26.234 [http-nio-8080-exec-1] INFO  c.e.s.AssemblyService - Assembly validation completed with 2 warnings
2026-10-22 08:15:26.567 [http-nio-8080-exec-1] INFO  c.e.s.AssemblyService - Starting visual assembly process
2026-10-22 08:15:27.890 [pool-2-thread-3] DEBUG c.e.s.VisualProcessor - Rendering component COMP-001 at position (0, 0)
2026-10-22 08:15:28.123 [pool-2-thread-3] DEBUG c.e.s.VisualProcessor - Rendering component COMP-002 at position (256, 0)
2026-10-22 08:15:28.456 [pool-2-thread-3] DEBUG c.e.s.VisualProcessor - Rendering component COMP-003 at position (512, 0)
2026-10-22 08:15:29.789 [pool-2-thread-3] WARN  c.e.s.VisualProcessor - Texture for COMP-005 not found, using fallback
2026-10-22 08:15:30.012 [pool-2-thread-3] INFO  c.e.s.VisualProcessor - Visual assembly completed in 3.445s
2026-10-22 08:15:30.345 [http-nio-8080-exec-1] INFO  c.e.c.AssemblyController - Assembly ASB-2026-1042 completed successfully
2026-10-22 09:30:15.678 [http-nio-8080-exec-5] INFO  c.e.c.AssemblyController - Processing assembly request: id=ASB-2026-1043
2026-10-22 09:30:15.901 [http-nio-8080-exec-5] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database
2026-10-22 09:30:16.234 [http-nio-8080-exec-5] ERROR c.e.s.AssemblyService - Failed to load assembly configuration: Connection refused to database server
java.net.ConnectException: Connection refused (Connection refused)
\tat java.base/java.net.PlainSocketImpl.connect(PlainSocketImpl.java:195)
\tat java.base/java.net.SocksSocketImpl.connect(SocksSocketImpl.java:392)
\tat java.base/java.net.Socket.connect(Socket.java:609)
\tat com.mysql.cj.protocol.StandardSocketFactory.connect(StandardSocketFactory.java:155)
\tat com.mysql.cj.protocol.a.NativeSocketConnection.connect(NativeSocketConnection.java:63)
\tat com.mysql.cj.ConnectionImpl.connect(ConnectionImpl.java:446)
\tat com.zaxxer.hikari.pool.HikariPool.createConnection(HikariPool.java:483)
\tat c.e.s.AssemblyService.loadConfiguration(AssemblyService.java:142)
\tat c.e.c.AssemblyController.processAssembly(AssemblyController.java:67)
2026-10-22 09:30:16.567 [http-nio-8080-exec-5] ERROR c.e.c.AssemblyController - Assembly request failed: ASB-2026-1043
2026-10-22 09:30:16.890 [http-nio-8080-exec-5] WARN  c.e.c.AssemblyController - Retrying assembly request in 5 seconds (attempt 1/3)
2026-10-22 09:30:22.123 [http-nio-8080-exec-5] INFO  c.e.s.AssemblyService - Database connection restored
2026-10-22 09:30:22.456 [http-nio-8080-exec-5] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database (retry)
2026-10-22 09:30:22.789 [http-nio-8080-exec-5] INFO  c.e.s.AssemblyService - Assembly ASB-2026-1043 loaded successfully on retry
2026-10-22 10:45:33.012 [scheduler-1] INFO  c.e.s.MaintenanceService - Starting scheduled maintenance check
2026-10-22 10:45:33.345 [scheduler-1] DEBUG c.e.s.MaintenanceService - Checking disk space on /opt/assembly_visual/data
2026-10-22 10:45:33.678 [scheduler-1] WARN  c.e.s.MaintenanceService - Disk usage at 82% on /opt/assembly_visual/data (threshold: 80%)
2026-10-22 10:45:34.012 [scheduler-1] INFO  c.e.s.MaintenanceService - Cleaning temporary assembly files older than 24h
2026-10-22 10:45:35.345 [scheduler-1] INFO  c.e.s.MaintenanceService - Removed 47 temporary files (total: 2.3 GB)
2026-10-22 10:45:35.678 [scheduler-1] INFO  c.e.s.MaintenanceService - Maintenance check completed
2026-10-22 11:20:44.901 [http-nio-8080-exec-8] INFO  c.e.c.AssemblyController - Processing assembly request: id=ASB-2026-1044
2026-10-22 11:20:45.234 [http-nio-8080-exec-8] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database
2026-10-22 11:20:45.567 [http-nio-8080-exec-8] INFO  c.e.s.AssemblyService - Found 8 components for assembly ASB-2026-1044
2026-10-22 11:20:46.890 [http-nio-8080-exec-8] INFO  c.e.s.AssemblyService - Starting visual assembly process
2026-10-22 11:20:47.123 [pool-2-thread-5] DEBUG c.e.s.VisualProcessor - Rendering component COMP-001 at position (0, 0)
2026-10-22 11:20:47.456 [pool-2-thread-5] ERROR c.e.s.VisualProcessor - OutOfMemoryError during rendering of COMP-004
java.lang.OutOfMemoryError: Java heap space
\tat java.desktop/java.awt.image.DataBufferInt.<init>(DataBufferInt.java:75)
\tat java.desktop/java.awt.image.Raster.createPackedRaster(Raster.java:465)
\tat java.desktop/java.awt.image.DirectColorModel.createCompatibleWritableRaster(DirectColorModel.java:1032)
\tat c.e.s.VisualProcessor.renderComponent(VisualProcessor.java:234)
\tat c.e.s.VisualProcessor.processAssembly(VisualProcessor.java:89)
Caused by: java.lang.OutOfMemoryError: Java heap space
2026-10-22 11:20:47.789 [pool-2-thread-5] FATAL c.e.s.VisualProcessor - Visual assembly process crashed: insufficient memory
2026-10-22 11:20:48.012 [http-nio-8080-exec-8] ERROR c.e.c.AssemblyController - Assembly ASB-2026-1044 failed with FATAL error
2026-10-22 11:20:48.345 [http-nio-8080-exec-8] ERROR c.e.c.AssemblyController - Notifying admin team about FATAL error
2026-10-22 11:20:48.678 [main] INFO  c.e.s.MemoryMonitor - Triggering emergency GC
2026-10-22 11:20:50.901 [main] INFO  c.e.s.MemoryMonitor - Memory recovered: freed 1.2 GB, current usage: 65%
2026-10-22 11:20:51.234 [main] INFO  c.e.s.MemoryMonitor - System recovered from OOM condition
2026-10-22 14:05:12.567 [http-nio-8080-exec-12] INFO  c.e.c.AssemblyController - Processing assembly request: id=ASB-2026-1045
2026-10-22 14:05:12.890 [http-nio-8080-exec-12] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database
2026-10-22 14:05:13.123 [http-nio-8080-exec-12] INFO  c.e.s.AssemblyService - Found 15 components for assembly ASB-2026-1045
2026-10-22 14:05:13.456 [http-nio-8080-exec-12] INFO  c.e.s.AssemblyService - Assembly validation started for ASB-2026-1045
2026-10-22 14:05:14.789 [http-nio-8080-exec-12] WARN  c.e.s.AssemblyService - Component COMP-015 has unverified signature
2026-10-22 14:05:15.012 [http-nio-8080-exec-12] INFO  c.e.s.AssemblyService - Assembly validation completed with 1 warning
2026-10-22 14:05:15.345 [http-nio-8080-exec-12] INFO  c.e.s.AssemblyService - Starting visual assembly process
2026-10-22 14:05:16.678 [pool-2-thread-7] DEBUG c.e.s.VisualProcessor - Rendering 15 components in parallel mode
2026-10-22 14:05:17.901 [pool-2-thread-7] INFO  c.e.s.VisualProcessor - Visual assembly completed in 2.556s
2026-10-22 14:05:18.234 [http-nio-8080-exec-12] INFO  c.e.c.AssemblyController - Assembly ASB-2026-1045 completed successfully
2026-10-22 16:09:00.567 [shutdown-hook] INFO  c.e.Application - Shutting down application...
2026-10-22 16:09:01.890 [shutdown-hook] INFO  c.z.h.HikariDataSource - HikariPool-1 - Shutdown initiated...
2026-10-22 16:09:02.123 [shutdown-hook] INFO  c.z.h.HikariDataSource - HikariPool-1 - Shutdown completed.
2026-10-22 16:09:02.456 [shutdown-hook] INFO  c.e.Application - Application shutdown complete`
  },
  {
    name: 'app.log',
    size: 27101,
    lastModified: '2026-10-23 08:41',
    content: `2026-10-23 07:00:01.100 [main] INFO  c.e.Application - Starting Application v2.4.1 on prod-server-01 with PID 18923
2026-10-23 07:00:01.400 [main] INFO  c.e.Application - Active profile: production
2026-10-23 07:00:02.700 [main] INFO  o.s.b.w.e.t.TomcatWebServer - Tomcat initialized with port(s): 8080 (http)
2026-10-23 07:00:03.000 [main] INFO  o.s.o.j.LocalContainerEntityManagerFactoryBean - Initializing JPA entity manager factory
2026-10-23 07:00:04.200 [main] INFO  c.z.h.HikariDataSource - HikariPool-1 - Starting...
2026-10-23 07:00:04.500 [main] INFO  c.z.h.HikariDataSource - HikariPool-1 - Start completed.
2026-10-23 07:00:05.800 [main] INFO  o.s.b.w.e.t.TomcatWebServer - Tomcat started on port(s): 8080 (http) with context path ''
2026-10-23 07:00:05.900 [main] INFO  c.e.Application - Started Application in 4.800 seconds (JVM running for 5.300)
2026-10-23 07:15:10.100 [http-nio-8080-exec-1] INFO  c.e.c.AssemblyController - Processing assembly request: id=ASB-2026-1046
2026-10-23 07:15:10.400 [http-nio-8080-exec-1] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database
2026-10-23 07:15:10.700 [http-nio-8080-exec-1] INFO  c.e.s.AssemblyService - Found 10 components for assembly ASB-2026-1046
2026-10-23 07:15:11.000 [http-nio-8080-exec-1] INFO  c.e.s.AssemblyService - Starting visual assembly process
2026-10-23 07:15:12.300 [pool-2-thread-1] DEBUG c.e.s.VisualProcessor - Rendering 10 components in parallel mode
2026-10-23 07:15:13.600 [pool-2-thread-1] INFO  c.e.s.VisualProcessor - Visual assembly completed in 2.600s
2026-10-23 07:15:13.900 [http-nio-8080-exec-1] INFO  c.e.c.AssemblyController - Assembly ASB-2026-1046 completed successfully
2026-10-23 08:00:05.100 [scheduler-1] INFO  c.e.s.HealthCheckService - Running health check
2026-10-23 08:00:05.400 [scheduler-1] INFO  c.e.s.HealthCheckService - Database connection: OK
2026-10-23 08:00:05.700 [scheduler-1] INFO  c.e.s.HealthCheckService - Disk space: OK (78%)
2026-10-23 08:00:06.000 [scheduler-1] INFO  c.e.s.HealthCheckService - Memory usage: OK (52%)
2026-10-23 08:00:06.300 [scheduler-1] INFO  c.e.s.HealthCheckService - Health check passed
2026-10-23 08:30:22.100 [http-nio-8080-exec-3] INFO  c.e.c.AssemblyController - Processing assembly request: id=ASB-2026-1047
2026-10-23 08:30:22.400 [http-nio-8080-exec-3] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database
2026-10-23 08:30:22.700 [http-nio-8080-exec-3] WARN  c.e.s.AssemblyService - Slow query detected: assembly config load took 3200ms (threshold: 1000ms)
2026-10-23 08:30:23.000 [http-nio-8080-exec-3] INFO  c.e.s.AssemblyService - Found 6 components for assembly ASB-2026-1047
2026-10-23 08:30:23.300 [http-nio-8080-exec-3] INFO  c.e.s.AssemblyService - Starting visual assembly process
2026-10-23 08:30:24.600 [pool-2-thread-2] DEBUG c.e.s.VisualProcessor - Rendering 6 components
2026-10-23 08:30:25.900 [pool-2-thread-2] INFO  c.e.s.VisualProcessor - Visual assembly completed in 2.600s
2026-10-23 08:30:26.200 [http-nio-8080-exec-3] INFO  c.e.c.AssemblyController - Assembly ASB-2026-1047 completed successfully
2026-10-23 08:41:00.100 [http-nio-8080-exec-4] INFO  c.e.c.AssemblyController - Processing assembly request: id=ASB-2026-1048
2026-10-23 08:41:00.400 [http-nio-8080-exec-4] DEBUG c.e.s.AssemblyService - Loading assembly configuration from database`
  }
];
