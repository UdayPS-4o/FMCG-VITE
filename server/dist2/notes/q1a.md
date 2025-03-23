# Q.1(A): What is the fundamental difference between Pure ALOHA and Slotted ALOHA in terms of their timing mechanisms?

**Answer:**

Pure ALOHA and Slotted ALOHA are both multiple access protocols used in network communication to allow multiple nodes to share a common communication channel. The fundamental difference lies in their timing mechanisms for transmission.

*   **Pure ALOHA:** In Pure ALOHA, nodes can transmit data frames whenever they have data to send. There is no central clock or time synchronization. If a collision occurs (i.e., two or more nodes transmit at overlapping times), the frames are corrupted and need to be retransmitted. Each node waits for a random backoff time before attempting retransmission. Pure ALOHA is simple to implement but inefficient due to a higher probability of collisions.

*   **Slotted ALOHA:** Slotted ALOHA improves upon Pure ALOHA by introducing discrete time slots. The time axis is divided into slots of equal duration, typically equal to the frame transmission time. Nodes are only allowed to begin transmission at the beginning of a time slot. This synchronization reduces the collision probability compared to Pure ALOHA. If two nodes attempt to transmit in the same time slot, a collision still occurs, and both frames are lost. Nodes then retransmit in a future time slot after a random backoff. Slotted ALOHA is more efficient than Pure ALOHA because it reduces the vulnerable time for collisions.

In essence, Pure ALOHA is completely unsynchronized, while Slotted ALOHA introduces synchronization by dividing time into slots, thereby reducing collision probability and improving channel utilization.